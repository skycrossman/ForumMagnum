import { MongoCollection } from "../mongoCollection";
import { getSqlClient, getSqlClientOrThrow } from "../sql/sqlClient";
import { isAnyTest } from "../executionEnvironment";
import Table from "./Table";
import Query from "./Query";
import InsertQuery from "./InsertQuery";
import SelectQuery from "./SelectQuery";
import UpdateQuery from "./UpdateQuery";
import DeleteQuery from "./DeleteQuery";
import CreateIndexQuery from "./CreateIndexQuery";
import DropIndexQuery from "./DropIndexQuery";
import Pipeline from "./Pipeline";
import BulkWriter, { BulkWriterResult } from "./BulkWriter";
import util from "util";

const SLOW_QUERY_REPORT_CUTOFF_MS = 2000;

let executingQueries = 0;

export const isAnyQueryPending = () => executingQueries > 0;

type ExecuteQueryData<T extends DbObject> = {
  selector: MongoSelector<T> | string;
  projection: MongoProjection<T>;
  data: T;
  modifier: MongoModifier<T>;
  fieldOrSpec: MongoIndexSpec;
  pipeline: MongoAggregationPipeline<T>;
  operations: MongoBulkWriteOperations<T>;
  indexName: string;
  options: MongoFindOptions<T>
    | MongoUpdateOptions<T>
    | MongoUpdateOptions<T>
    | MongoRemoveOptions<T>
    | MongoEnsureIndexOptions
    | MongoAggregationOptions
    | MongoBulkWriteOptions
    | MongoDropIndexOptions;
}

/**
 * PgCollection is the main external interface for other parts of the codebase to
 * access data inside of Postgres. It's the Postgres equivalent of our MongoCollection
 * class.
 *
 * For now, we extend MongoCollection explitely because there's a lot of magic
 * happening there, but the eventual goal is to remove MongoCollection completely and
 * to instead implement CollectionBase.
 */
class PgCollection<T extends DbObject> extends MongoCollection<T> {
  table: Table;

  constructor(tableName: string, options?: { _suppressSameNameError?: boolean }) {
    super(tableName, options);
  }

  isPostgres() {
    return true;
  }

  isConnected() {
    return !!getSqlClient();
  }

  buildPostgresTable() {
    this.table = Table.fromCollection(this as unknown as CollectionBase<T>);
  }

  /**
   * Execute the given query
   * The `data` parameter is completely optional and is only used to improve
   * the error message if something goes wrong. It can also be used to disable
   * logging by setting `data.options.quiet` to `true`.
   */
  async executeQuery(
    query: Query<T>,
    data?: Partial<ExecuteQueryData<T>>,
  ): Promise<any[]> {
    executingQueries++;
    let result: any[];
    const quiet = data?.options?.quiet ?? false;
    try {
      const {sql, args} = query.compile();
      const client = getSqlClientOrThrow();
      const startTime = new Date().getTime();
      result = await client.any(sql, args);
      const endTime = new Date().getTime();
      const milliseconds = endTime - startTime;
      if (milliseconds > SLOW_QUERY_REPORT_CUTOFF_MS && !quiet && !isAnyTest) {
        // eslint-disable-next-line no-console
        console.trace(`Slow Postgres query detected (${milliseconds} ms): ${sql}: ${JSON.stringify(args)}`);
      }
    } catch (error) {
      // If this error gets triggered, you probably generated a malformed query
      const {collectionName} = this;
      const stringified = util.inspect({collectionName, ...data}, {depth: null});
      const {sql, args} = query.compile();
      if (!quiet) {
        // eslint-disable-next-line no-console
        console.error(`SQL Error for ${collectionName} at position ${error.position}: ${error.message}: \`${sql}\`: ${util.inspect(args)}: ${stringified}`);
      }
      throw error;
    } finally {
      executingQueries--;
    }
    const {postProcess} = this;
    return postProcess
      ? result.map((data) => postProcess(data))
      : result;
  }

  getTable = () => {
    if (bundleIsServer) {
      return this.table;
    } else {
      throw new Error("Attempted to run postgres query on the client");
    }
  }

  find = (selector?: MongoSelector<T>, options?: MongoFindOptions<T>): FindResult<T> => {
    return {
      fetch: async () => {
        const select = new SelectQuery<T>(this.getTable(), selector, options);
        const result = await this.executeQuery(select, {selector, options});
        return result as unknown as T[];
      },
      count: async () => {
        const select = new SelectQuery(this.getTable(), selector, options, {count: true});
        const result = await this.executeQuery(select, {selector, options});
        return parseInt(result?.[0].count ?? 0);
      },
    };
  }

  findOne = async (
    selector?: string | MongoSelector<T>,
    options?: MongoFindOneOptions<T>,
    projection?: MongoProjection<T>,
  ): Promise<T|null> => {
    const select = new SelectQuery<T>(this.getTable(), selector, {limit: 1, ...options, projection});
    const result = await this.executeQuery(select, {selector, options, projection});
    return result ? result[0] as unknown as T : null;
  }

  findOneArbitrary = async (): Promise<T|null> => {
    const select = new SelectQuery<T>(this.getTable(), undefined, {limit: 1});
    const result = await this.executeQuery(select);
    return result ? result[0] as unknown as T : null;
  }

  rawInsert = async (data: T, options: MongoInsertOptions<T>) => {
    const insert = new InsertQuery<T>(this.getTable(), data, options, {returnInserted: true});
    const result = await this.executeQuery(insert, {data, options});
    return result[0]._id;
  }

  private async upsert(
    selector: string | MongoSelector<T>,
    modifier: MongoModifier<T>,
    options: MongoUpdateOptions<T> & {upsert: true},
  ) {
    const {$set, ...rest} = modifier;
    const data = {
      ...$set,
      ...rest,
      ...selector,
    } as T;
    const upsert = new InsertQuery<T>(this.getTable(), data, options, {
      conflictStrategy: "upsert",
      upsertSelector: selector,
    });
    const result = await this.executeQuery(upsert, {selector, modifier, options});
    const action = result[0]?.action;
    if (!action) {
      return 0;
    }
    const returnCount = options?.returnCount ?? "matchedCount";
    switch (returnCount) {
    case "matchedCount":
      return action === "updated" ? 1 : 0;
    case "upsertedCount":
      return action === "inserted" ? 1 : 0;
    default:
      throw new Error(`Invalid upsert return count: ${returnCount}`);
    }
  }

  rawUpdateOne = async (
    selector: string | MongoSelector<T>,
    modifier: MongoModifier<T>,
    options: MongoUpdateOptions<T>,
  ) => {
    if (options?.upsert) {
      return this.upsert(selector, modifier, options);
    }
    const update = new UpdateQuery<T>(this.getTable(), selector, modifier, options, {limit: 1});
    const result = await this.executeQuery(update, {selector, modifier, options});
    return result.length;
  }

  rawUpdateMany = async (
    selector: string | MongoSelector<T>,
    modifier: MongoModifier<T>,
    options: MongoUpdateOptions<T>,
  ) => {
    const update = new UpdateQuery<T>(this.getTable(), selector, modifier, options);
    const result = await this.executeQuery(update, {selector, modifier, options});
    return result.length;
  }

  rawRemove = async (selector: string | MongoSelector<T>, options?: MongoRemoveOptions<T>) => {
    options = Object.assign({noSafetyHarness: true}, options);
    const query = new DeleteQuery<T>(this.getTable(), selector, options, options);
    const result = await this.executeQuery(query, {selector, options});
    return {deletedCount: result.length};
  }

  _ensureIndex = async (fieldOrSpec: MongoIndexSpec, options?: MongoEnsureIndexOptions) => {
    const key: Record<string, 1 | -1> = typeof fieldOrSpec === "string" ? {[fieldOrSpec]: 1} : fieldOrSpec;
    const index = this.table.getIndex(Object.keys(key), options) ?? this.getTable().addIndex(key, options);
    const query = new CreateIndexQuery(this.getTable(), index, true);
    await this.executeQuery(query, {fieldOrSpec, options})
  }

  aggregate = (pipeline: MongoAggregationPipeline<T>, options?: MongoAggregationOptions) => {
    return {
      toArray: async () => {
        try {
          const query = new Pipeline<T>(this.getTable(), pipeline, options).toQuery();
          const result = await this.executeQuery(query, {pipeline, options});
          return result as unknown as T[];
        } catch (e) {
          const {collectionName} = this;
          // If you see this, you probably built a bad aggregation pipeline, or
          // this file has a bug, or you're using an unsupported aggregation
          // pipeline operator
          // eslint-disable-next-line no-console
          console.error("Aggregate error:", collectionName, ":", e, ":", util.inspect(pipeline, {depth: null}));
          throw e;
        }
      },
    };
  }

  rawCollection = () => ({
    bulkWrite: async (operations: MongoBulkWriteOperations<T>, options: MongoBulkWriteOptions) => {
      executingQueries++;
      let result: BulkWriterResult;
      try {
        const client = getSqlClientOrThrow();
        const writer = new BulkWriter(this.getTable(), operations, options);
        result = await writer.execute(client);
      } finally {
        executingQueries--;
      }
      return result;
    },
    findOneAndUpdate: async (
      selector: string | MongoSelector<T>,
      modifier: MongoModifier<T>,
      options: MongoUpdateOptions<T>,
    ) => {
      const update = new UpdateQuery<T>(this.getTable(), selector, modifier, options, {limit: 1, returnUpdated: true});
      const result = await this.executeQuery(update, {selector, modifier, options});
      return {
        ok: 1,
        value: result[0],
      };
    },
    dropIndex: async (indexName: string, options?: MongoDropIndexOptions) => {
      const dropIndex = new DropIndexQuery(this.getTable(), indexName);
      await this.executeQuery(dropIndex, {indexName, options})
    },
    indexes: (_options: never) => {
      return Promise.resolve(this.getTable().getIndexes().map((index) => index.getDetails()));
    },
    updateOne: async (
      selector: string | MongoSelector<T>,
      modifier: MongoModifier<T>,
      options: MongoUpdateOptions<T>,
    ) => {
      const result = await this.rawUpdateOne(selector, modifier, options);
      return {
        acknowledged: true,
        matchedCount: result,
        modifiedCount: result,
      };
    },
    updateMany: async (
      selector: string | MongoSelector<T>,
      modifier: MongoModifier<T>,
      options: MongoUpdateOptions<T>,
    ) => {
      await this.rawUpdateMany(selector, modifier, options);
      return {
        ok: 1,
        value: null,
      };
    },
  });
}

export default PgCollection;
