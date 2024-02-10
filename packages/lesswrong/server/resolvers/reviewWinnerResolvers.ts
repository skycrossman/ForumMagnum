import moment from "moment";
import { userIsAdmin } from "../../lib/vulcan-users";
import { defineQuery } from "../utils/serverGraphqlUtil";
import { onStartup } from "../../lib/executionEnvironment";
import { createAnonymousContext } from "../vulcan-lib";
import type { ReviewWinnerWithPost } from "../repos/ReviewWinnersRepo";

interface ReviewWinnerCache {
  reviewWinners: ReviewWinnerWithPost[];
  lastUpdatedAt: Date;
}

const REVIEW_WINNER_CACHE: ReviewWinnerCache = {
  reviewWinners: [],
  lastUpdatedAt: new Date()
};

async function updateReviewWinnerCache(context: ResolverContext) {
  const updatedReviewWinners = await context.repos.reviewWinners.getAllReviewWinnersWithPosts();
  REVIEW_WINNER_CACHE.reviewWinners = updatedReviewWinners;
  REVIEW_WINNER_CACHE.lastUpdatedAt = new Date();
}

onStartup(async () => {
  await updateReviewWinnerCache(createAnonymousContext());
});

// TO DO: have the right permissions checks when we get the posts
defineQuery({
  name: 'GetAllReviewWinners',
  resultType: '[Post!]!',
  fn: async (root, args, context) => {
    const { currentUser } = context;

    // if (!userIsAdmin(currentUser)) {
    //   throw new Error('Only admins may fetch all review winners using this API!');
    // }

    const cacheStale = moment(REVIEW_WINNER_CACHE.lastUpdatedAt).isBefore(moment(new Date()).subtract(1, 'hour'));
    if (cacheStale) {
      await updateReviewWinnerCache(context);
    }

    return REVIEW_WINNER_CACHE.reviewWinners;
  }
})

// defineMutation({
//   name: 'UpdateReviewWinnerOrder',
//   resultType: '[ReviewWinnerWithPost!]!',
//   argTypes: '(reviewWinnerId: String!, newCuratedOrder: Int!)',
//   fn: async (_, { reviewWinnerId, newCuratedOrder }: { reviewWinnerId: string, newCuratedOrder: number }, context) => {
//     const { currentUser } = context;

//     if (!userIsAdmin(currentUser)) {
//       throw new Error('Only admins may update review winner ordering!');
//     }

//     await context.repos.reviewWinners.updateCuratedOrder(reviewWinnerId, newCuratedOrder);
//     await updateReviewWinnerCache(context);

//     return REVIEW_WINNER_CACHE.reviewWinners;
//   }
// });
