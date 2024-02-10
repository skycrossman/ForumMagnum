import { foreignKeyField, resolverOnlyField, schemaDefaultValue } from "../../utils/schemaUtils";

export const schema: SchemaType<"ReviewWinners"> = {
  postId: {
    ...foreignKeyField({
      collectionName: 'Posts',
      idFieldName: 'postId',
      resolverName: 'post',
      type: 'Post',
      nullable: false,
      autoJoin: true
    }),
    type: String,
    nullable: false,
    canRead: ['guests'],
    canCreate: ['admins'],
    canUpdate: ['admins']
  },
  reviewWinnerArt: resolverOnlyField({
    type: 'ReviewWinnerArt',
    graphQLtype: 'ReviewWinnerArt',
    canRead: ['guests'],
    resolver: async (reviewWinner: DbReviewWinner, args: void, context: ResolverContext) => {
      const { repos } = context;
      return repos.reviewWinnerArts.getActiveReviewWinnerArt(reviewWinner.postId);
    },
    sqlResolver: ({ join, field }) => join({
      table: 'ReviewWinnerArts',
      type: 'left',
      on: {
        postId: field('postId')
      },
      resolver: (reviewWinnerArtsField) => `(
        SELECT sac.*
        FROM "SplashArtCoordinates" AS sac
        WHERE sac."reviewWinnerArtsId" = ${reviewWinnerArtsField('_id')}
        ORDER BY sac."createdAt" DESC
        LIMIT 1
      )`
    })
  }),
  competitorCount: resolverOnlyField({
    type: 'Int',
    graphQLtype: 'Int',
    canRead: ['guests'],
    resolver: async (reviewWinner: DbReviewWinner, args: void, context: ResolverContext) => {
      /* Calculated via:
      SELECT COUNT(DISTINCT "Posts"."_id")
      FROM "Posts"
      WHERE "postedAt" >= '{YEAR}-01-01'
        AND "postedAt" < '{YEAR+1}-01-01'
        AND "baseScore" > 0
        AND "draft" is false
      AND "Posts"."_id" IN (
          SELECT "Votes"."documentId"
          FROM "Votes"
          GROUP BY "Votes"."documentId"
          HAVING COUNT("Votes"."_id") > 1
      );
      */
      const yearCompetitors: Record<number, number> = {
        2018: 1744,
        2019: 2147,
        2020: 3015,
        2021: 3246,
        2022: 4488
      };
      return yearCompetitors[reviewWinner.reviewYear];
    }
  }),
  reviewYear: {
    type: Number,
    nullable: false,
    canRead: ['guests'],
    canCreate: ['admins'],
    canUpdate: ['admins']
  },
  category: {
    type: String,
    allowedValues: ['rationality', 'modeling', 'optimization', 'ai', 'practical', 'misc'],
    nullable: false,
    canRead: ['guests'],
    canCreate: ['admins'],
    canUpdate: ['admins'],
    ...schemaDefaultValue('misc'),
  },
  curatedOrder: {
    type: Number,
    nullable: false,
    canRead: ['guests'],
    canCreate: ['admins'],
    canUpdate: ['admins']
  },
  reviewRanking: {
    type: Number,
    nullable: false,
    canRead: ['guests'],
    canCreate: ['admins'],
    canUpdate: ['admins']
  },
  isAI: {
    type: Boolean,
    nullable: false,
    canRead: ['guests'],
    canCreate: ['admins'],
    canUpdate: ['admins']
  },
}
