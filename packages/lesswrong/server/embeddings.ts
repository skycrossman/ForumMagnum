import Posts from "../lib/collections/posts/collection";
import { PostEmbeddingsRepo, PostsRepo } from "./repos";
import { forEachDocumentBatchInCollection } from "./manualMigrations/migrationUtils";
import { getOpenAI } from "./languageModels/languageModelIntegration";
import { htmlToTextDefault } from "../lib/htmlToText";
import { Globals } from "./vulcan-lib";
import { inspect } from "util";
import md5 from "md5";
import { isAnyTest, isE2E } from "../lib/executionEnvironment";
import { isEAForum } from "../lib/instanceSettings";
import { addCronJob } from "./cronUtil";
import { TiktokenModel, encoding_for_model } from "@dqbd/tiktoken";
import mapValues from "lodash/mapValues";
import chunk from "lodash/chunk";
import { EMBEDDINGS_VECTOR_SIZE } from "../lib/collections/postEmbeddings/schema";

export const HAS_EMBEDDINGS_FOR_RECOMMENDATIONS = isEAForum && !isE2E;

export const DEFAULT_EMBEDDINGS_MODEL: TiktokenModel = "text-embedding-ada-002";
const NEW_EMBEDDINGS_MODEL = "text-embedding-3-large";

const DEFAULT_EMBEDDINGS_MODEL_MAX_TOKENS = 8191;

type EmbeddingsResult = {
  embeddings: number[],
  model: string,
}

/**
 * OpenAI models have a maximum number of "tokens" that the input can consist of.
 * What a token is exactly is non-trivial and must be calculated using the
 * tiktoken library, but a good general rule of thumb is that 1 token is approximately
 * 4 characters.
 *
 * This function trims a given input to make sure it contains less than `maxTokens`
 * tokens. It does this by iteratively reducing the length of the string using
 * the "1 token ~= 4 chars" heuristic, and then checking the result against the
 * actually encoding length. In the vast majority of cases, no more than 2
 * iterations of the loop should be necessary.
 */
const trimText = (
  text: string,
  model: TiktokenModel,
  maxTokens: number,
): string => {
  const encoding = encoding_for_model(model);

  for (
    let encoded = encoding.encode(text);
    encoded.length > maxTokens;
    encoded = encoding.encode(text)
  ) {
    const charsToRemove = 1 + ((encoded.length - maxTokens) * 4);
    text = text.slice(0, text.length - charsToRemove);
  }

  encoding.free();
  return text;
}

const getBatchEmbeddingsFromApi = async (inputs: Record<string, string>) => {
  if (isAnyTest) {
    return {
      embeddings: {},
      model: "test",
    };
  }
  const api = await getOpenAI();
  if (!api) {
    throw new Error("OpenAI client is not configured");
  }

  // The NodeJS tokenizer library doesn't (yet) support the `text-embedding-3-large` model prefix:
  // https://github.com/dqbd/tiktoken/blob/a7cce9922b10bca567be8453f1ef0489428fa02f/js/src/core.ts#L211
  // But using the old one for tokenization works just fine, since it maps to the same encoding, according to the original python library:
  // https://github.com/openai/tiktoken/blob/c0ba74c238d18b4824c25f3c27fc8698055b9a76/tiktoken/model.py#L31
  const tokenizerModel = DEFAULT_EMBEDDINGS_MODEL;
  const embeddingModel = NEW_EMBEDDINGS_MODEL;
  const maxTokens = DEFAULT_EMBEDDINGS_MODEL_MAX_TOKENS;

  const trimmedInputTuples: [string, string][] = [];
  for (const [postId, postText] of Object.entries(inputs)) {
    try {
      const trimmedText = trimText(postText, tokenizerModel, maxTokens);
      trimmedInputTuples.push([postId, trimmedText]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`Failed to trim text for post ${postId}`);
    }
  }

  const filteredInputTuples = trimmedInputTuples.filter(([_, trimmedText]) => !!trimmedText);
  const filteredInputs = filteredInputTuples.map(([_, text]) => text);

  if (filteredInputs.length === 0) {
    return {
      embeddings: {},
      model: embeddingModel
    };
  }

  const result = await api.embeddings.create({
    input: filteredInputs,
    model: embeddingModel,
    dimensions: EMBEDDINGS_VECTOR_SIZE,
  });

  const embeddingResults = result?.data;
  if (
    !embeddingResults ||
    !Array.isArray(embeddingResults) ||
    embeddingResults.some(({ embedding }) => 
      !embedding.length ||
      typeof embedding[0] !== "number"
    )
  ) {
    throw new Error(`Invalid API response: ${inspect(result, {depth: null})}`);
  }

  const orderedEmbeddings = embeddingResults.sort((a, b) => a.index - b.index).map(({ embedding }) => embedding);
  const mappedEmbeddings = Object.fromEntries(filteredInputTuples.map(([postId], idx) => [postId, orderedEmbeddings[idx]] as const));

  return {
    embeddings: mappedEmbeddings,
    model: embeddingModel
  };
}

const getEmbeddingsFromApi = async (text: string): Promise<EmbeddingsResult> => {
  if (isAnyTest) {
    return {
      embeddings: [],
      model: "test",
    };
  }
  const api = await getOpenAI();
  if (!api) {
    throw new Error("OpenAI client is not configured");
  }
  const model = DEFAULT_EMBEDDINGS_MODEL;
  const maxTokens = DEFAULT_EMBEDDINGS_MODEL_MAX_TOKENS;
  const trimmedText = trimText(text, model, maxTokens);
  const result = await api.embeddings.create({
    input: trimmedText,
    model,
  });
  const embeddings = result?.data?.[0].embedding;
  if (
    !embeddings ||
    !Array.isArray(embeddings) ||
    !embeddings.length ||
    typeof embeddings[0] !== "number"
  ) {
    throw new Error(`Invalid API response: ${inspect(result, {depth: null})}`);
  }
  return {
    embeddings,
    model,
  };
}

type EmbeddingsWithHash = EmbeddingsResult & { hash: string };

const getEmbeddingsForPost = async (
  postId: string,
): Promise<EmbeddingsWithHash> => {
  const post = await Posts.findOne({_id: postId});
  if (!post) {
    throw new Error(`Can't find post with id ${postId}`);
  }
  const text = htmlToTextDefault(post.contents?.html ?? "");
  const embeddings = await getEmbeddingsFromApi(text);
  const hash = md5(text);
  return {hash, ...embeddings};
}

const getEmbeddingsForPosts = async (
  posts: DbPost[],
): Promise<Record<string, EmbeddingsWithHash>> => {
  const textMappings = Object.fromEntries(posts.map((post) => [post._id, htmlToTextDefault(post.contents?.html ?? "")] as const));
  const hashMappings = mapValues(textMappings, (postText: string) => md5(postText));

  const embeddingResult = await getBatchEmbeddingsFromApi(textMappings);

  const embeddingsWithHashes: Record<string, EmbeddingsWithHash> = mapValues(embeddingResult.embeddings, (postEmbeddings, postId) => ({
    hash: hashMappings[postId],
    embeddings: postEmbeddings,
    model: embeddingResult.model
  }));

  return embeddingsWithHashes;
}

export const updatePostEmbeddings = async (postId: string) => {
  const {hash, embeddings, model} = await getEmbeddingsForPost(postId);
  const repo = new PostEmbeddingsRepo();
  await repo.setPostEmbeddings(postId, hash, model, embeddings);
}

export const batchUpdatePostEmbeddings = async (posts: DbPost[]) => {
  const repo = new PostEmbeddingsRepo();
  const postEmbeddings = await getEmbeddingsForPosts(posts);
  const updates = Object.entries(postEmbeddings).map(([postId, { hash, model, embeddings }]) => repo.setPostEmbeddings(postId, hash, model, embeddings));
  await Promise.all(updates);
}

const updateAllPostEmbeddings = async () => {
  await forEachDocumentBatchInCollection({
    collection: Posts,
    batchSize: 100,
    callback: async (posts: DbPost[]) => {
      try {
        await batchUpdatePostEmbeddings(posts);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Error", e);
      }
    },
  });
}

export const updateMissingPostEmbeddings = async () => {
  const ids = await new PostsRepo().getPostIdsWithoutEmbeddings();
  for (const idBatch of chunk(ids, 50)) {
    try {
      const posts = await Posts.find({ _id: { $in: idBatch } }).fetch();
      await batchUpdatePostEmbeddings(posts);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`Failed to generate or update embeddings`, { error: e.response ?? e, idBatch });
    }
  }
}

Globals.updatePostEmbeddings = updatePostEmbeddings;
Globals.updateAllPostEmbeddings = updateAllPostEmbeddings;
Globals.updateMissingPostEmbeddings = updateMissingPostEmbeddings;

if (HAS_EMBEDDINGS_FOR_RECOMMENDATIONS) {
  addCronJob({
    name: "updateMissingEmbeddings",
    interval: "every 24 hours",
    job: updateMissingPostEmbeddings,
  });
}
