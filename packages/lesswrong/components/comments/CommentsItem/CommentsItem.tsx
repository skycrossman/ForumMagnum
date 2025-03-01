import React, { useState } from 'react';
import { Components, registerComponent } from '../../../lib/vulcan-lib';
import { userIsAllowedToComment } from '../../../lib/collections/users/helpers';
import { userCanDo, userIsAdmin } from '../../../lib/vulcan-users/permissions';
import classNames from 'classnames';
import withErrorBoundary from '../../common/withErrorBoundary';
import { useCurrentUser } from '../../common/withUser';
import { Link } from '../../../lib/reactRouterWrapper';
import { tagGetCommentLink } from "../../../lib/collections/tags/helpers";
import { Comments } from "../../../lib/collections/comments";
import { AnalyticsContext } from "../../../lib/analyticsEvents";
import type { CommentTreeOptions } from '../commentTree';
import { commentAllowTitle as commentAllowTitle, commentGetPageUrlFromIds } from '../../../lib/collections/comments/helpers';
import { isEAForum } from '../../../lib/instanceSettings';
import { REVIEW_NAME_IN_SITU, REVIEW_YEAR, reviewIsActive, eligibleToNominate } from '../../../lib/reviewUtils';
import { useCurrentTime } from '../../../lib/utils/timeUtil';
import startCase from 'lodash/startCase';
import FlagIcon from '@material-ui/icons/Flag';
import { hideUnreviewedAuthorCommentsSettings } from '../../../lib/publicSettings';
import { useCommentLink } from './useCommentLink';
import { userIsPostCoauthor } from '../../../lib/collections/posts/helpers';

// Shared with ParentCommentItem
export const styles = (theme: ThemeType): JssStyles => ({
  root: {
    paddingLeft: theme.spacing.unit*1.5,
    paddingRight: theme.spacing.unit*1.5,
    "&:hover $menu": {
      opacity:1
    }
  },
  subforumTop: {
    paddingTop: 4,
  },
  tagIcon: {
    marginRight: 6,
    '& svg': {
      width: 15,
      height: 15,
      fill: theme.palette.grey[600],
    },
  },
  body: {
    borderStyle: "none",
    padding: 0,
    ...theme.typography.commentStyle,
  },
  sideComment: {
    "& blockquote": {
      paddingRight: 0,
      marginLeft: 4,
      paddingLeft: 12,
    },
  },
  rightSection: {
    float: "right",
    marginRight: isEAForum ? -3 : -5,
    marginTop: isEAForum ? 2 : undefined,
  },
  linkIcon: {
    fontSize: "1.2rem",
    verticalAlign: "top",
    color: theme.palette.icon.dim,
    margin: "0 4px",
    position: "relative",
    top: 1,
  },
  menu: isEAForum
    ? {
      color: theme.palette.icon.dim,
    }
    : {
      opacity: .35,
    },
  replyLink: {
    marginRight: 5,
    display: "inline",
    fontWeight: theme.typography.body1.fontWeight,
    color: theme.palette.link.dim,
    "@media print": {
      display: "none",
    },
  },
  collapse: {
    marginRight: 5,
    opacity: 0.8,
    fontSize: "0.8rem",
    lineHeight: "1rem",
    paddingBottom: 4,
    display: "inline-block",
    verticalAlign: "middle",

    "& span": {
      fontFamily: "monospace",
    }
  },
  firstParentComment: {
    marginLeft: -theme.spacing.unit*1.5,
    marginRight: -theme.spacing.unit*1.5
  },
  meta: {
    "& > div": {
      display: "inline-block",
      marginRight: 5,
    },

    marginBottom: 8,
    color: theme.palette.text.dim,
    paddingTop: ".6em",

    "& a:hover, & a:active": {
      textDecoration: "none",
      color: `${theme.palette.linkHover.dim} !important`,
    },
  },
  sideCommentMeta: {
    display: "flex",
    alignItems: "baseline",
  },
  bottom: {
    paddingBottom: isEAForum ? theme.spacing.unit : 5,
    minHeight: 12,
    ...(isEAForum ? {} : {fontSize: 12}),
  },
  replyForm: {
    marginTop: 2,
    marginBottom: 8,
    border: theme.palette.border.normal,
    borderRadius: isEAForum ? theme.borderRadius.small : 0,
  },
  replyFormMinimalist: {
    borderRadius: theme.borderRadius.small,
  },
  deleted: {
    backgroundColor: theme.palette.panelBackground.deletedComment,
  },
  moderatorHat: {
    marginRight: 8,
  },
  username: {
    marginRight: 10,
    
    "$sideCommentMeta &": {
      flexGrow: 1,
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
      flexShrink: 1,
      display: "inline-block",
      overflowX: "hidden",
    },
  },
  metaNotice: {
    color: theme.palette.lwTertiary.main,
    fontSize: "1rem",
    marginBottom: theme.spacing.unit,
    marginLeft: theme.spacing.unit/2,
    ...theme.typography.italic,
  },
  pinnedIconWrapper: {
    color: theme.palette.grey[400],
    paddingTop: 10,
    marginBottom: '-3px',
  },
  pinnedIcon: {
    fontSize: 12
  },
  title: {
    ...theme.typography.display2,
    ...theme.typography.postStyle,
    flexGrow: 1,
    marginTop: 8,
    marginBottom: 0,
    marginLeft: 0,
    display: "block",
    fontSize: '1.5rem',
    lineHeight: '1.5em'
  },
  postTitle: {
    paddingTop: theme.spacing.unit,
    ...theme.typography.commentStyle,
    display: "block",
    color: theme.palette.link.dim2,
  },
  reviewVotingButtons: {
    borderTop: theme.palette.border.normal,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingLeft: 6,
  },
  updateVoteMessage: {
    ...theme.typography.body2,
    ...theme.typography.smallText,
    color: theme.palette.grey[600]
  },
  postTitleRow: {
    display: 'flex',
    columnGap: 8,
    alignItems: 'center'
  },
  flagIcon: {
    height: 13,
    color: theme.palette.error.main,
    position: "relative",
    top: 3
  },
  relevantTags: {
    marginLeft: 12,
    position: "relative",
    top: -2,
    '& .FooterTag-root:nth-child(n+4)': {
      marginTop: 8,
    }
  },
  relevantTag: {
    marginTop: 4,
  },
  showMoreTags: {
    position: "relative",
    top: 1,
    color: theme.palette.grey[500],
    fontSize: 12,
    marginLeft: 8,
  },
})

/**
 * CommentsItem: A single comment, not including any recursion for child comments
 *
 * Before adding more props to this, consider whether you should instead be adding a field to the CommentTreeOptions interface.
 */
export const CommentsItem = ({ treeOptions, comment, nestingLevel=1, isChild, collapsed, isParentComment, parentCommentId, scrollIntoView, toggleCollapse, setSingleLine, truncated, showPinnedOnProfile, parentAnswerId, enableGuidelines=true, showParentDefault=false, displayTagIcon=false, classes }: {
  treeOptions: CommentTreeOptions,
  comment: CommentsList|CommentsListWithParentMetadata,
  nestingLevel: number,
  isChild?: boolean,
  collapsed?: boolean,
  isParentComment?: boolean,
  parentCommentId?: string,
  scrollIntoView?: ()=>void,
  toggleCollapse?: ()=>void,
  setSingleLine?: (singleLine: boolean)=>void,
  truncated: boolean,
  showPinnedOnProfile?: boolean,
  parentAnswerId?: string|undefined,
  enableGuidelines?: boolean,
  showParentDefault?: boolean,
  displayTagIcon?: boolean,
  classes: ClassesType,
}) => {
  const [showReplyState, setShowReplyState] = useState(false);
  const [showEditState, setShowEditState] = useState(false);
  const [showParentState, setShowParentState] = useState(showParentDefault);
  const [showMoreClicked, setShowMoreClicked] = useState(false);
  const isMinimalist = treeOptions.replyFormStyle === "minimalist"
  const now = useCurrentTime();
  const currentUser = useCurrentUser();

  const { postPage, showCollapseButtons, tag, post, refetch, hideReply, showPostTitle, singleLineCollapse, hideReviewVoteButtons, moderatedCommentId, hideParentCommentToggle } = treeOptions;

  const commentLinkProps = {
    comment,
    post,
    tag,
    scrollIntoView,
    scrollOnClick: postPage && !isParentComment,
  };
  const CommentLinkWrapper = useCommentLink(commentLinkProps);

  const showCommentTitle = !!(commentAllowTitle(comment) && comment.title && !comment.deleted && !showEditState)

  const showReply = (event: React.MouseEvent) => {
    event.preventDefault();
    setShowReplyState(true);
  }

  const replyCancelCallback = () => {
    setShowReplyState(false);
  }

  const replySuccessCallback = () => {
    if (refetch) {
      refetch()
    }
    setShowReplyState(false);
  }

  const setShowEdit = () => {
    setShowEditState(true);
  }

  const editCancelCallback = () => {
    setShowEditState(false);
  }

  const editSuccessCallback = () => {
    if (refetch) {
      refetch()
    }
    setShowEditState(false);
  }

  const toggleShowParent = () => {
    setShowParentState(!showParentState);
  }
  
  const renderMenu = () => {
    const { CommentsMenu } = Components;
    return (
      <AnalyticsContext pageElementContext="tripleDotMenu">
        <CommentsMenu
          className={classes.menu}
          comment={comment}
          post={post}
          tag={tag}
          showEdit={setShowEdit}
        />
      </AnalyticsContext>
    )
  }
  
  const renderBodyOrEditor = () => {
    if (showEditState) {
      return <Components.CommentsEditForm
        comment={comment}
        successCallback={editSuccessCallback}
        cancelCallback={editCancelCallback}
      />
    } else {
      return (
        <Components.CommentBody truncated={truncated} collapsed={collapsed} comment={comment} postPage={postPage} />
      );
    }
  }

  const renderCommentBottom = () => {
    const { CommentBottomCaveats } = Components

    const blockedReplies = comment.repliesBlockedUntil && new Date(comment.repliesBlockedUntil) > now;

    const hideSince = hideUnreviewedAuthorCommentsSettings.get()
    const commentHidden = hideSince && new Date(hideSince) < new Date(comment.postedAt) &&
      comment.authorIsUnreviewed
    const showReplyButton = (
      !hideReply &&
      !comment.deleted &&
      (!blockedReplies || userCanDo(currentUser,'comments.replyOnBlocked.all')) &&
      // FIXME userIsAllowedToComment depends on some post metadatadata that we
      // often don't want to include in fragments, producing a type-check error
      // here. We should do something more complicated to give client-side feedback
      // if you're banned.
      // @ts-ignore
      (!currentUser || userIsAllowedToComment(currentUser, treeOptions.post)) &&
      !commentHidden
    )

    const showInlineCancel = showReplyState && isMinimalist
    return (
      <div className={classes.bottom}>
        <CommentBottomCaveats comment={comment} />
        {showReplyButton && (
          treeOptions?.replaceReplyButtonsWith?.(comment)
          || <a className={classNames("comments-item-reply-link", classes.replyLink)} onClick={showInlineCancel ? replyCancelCallback : showReply}>
            {showInlineCancel ? "Cancel" : "Reply"}
          </a>
        )}
      </div>
    );
  }

  const renderReply = () => {
    const levelClass = (nestingLevel + 1) % 2 === 0 ? "comments-node-even" : "comments-node-odd"

    return (
      <div className={classNames(classes.replyForm, levelClass, {[classes.replyFormMinimalist]: isMinimalist})}>
        <Components.CommentsNewForm
          post={treeOptions.post}
          parentComment={comment}
          successCallback={replySuccessCallback}
          cancelCallback={replyCancelCallback}
          prefilledProps={{
            parentAnswerId: parentAnswerId ? parentAnswerId : null
          }}
          type="reply"
          enableGuidelines={enableGuidelines}
          replyFormStyle={treeOptions.replyFormStyle}
        />
      </div>
    )
  }
  
  const {
    ShowParentComment, CommentsItemDate, CommentUserName, CommentShortformIcon,
    CommentDiscussionIcon, SmallSideVote, LWTooltip, PostsPreviewTooltipSingle, ReviewVotingWidget,
    LWHelpIcon, CoreTagIcon, FooterTag, LoadMore,
  } = Components

  if (!comment) {
    return null;
  }
  
  const authorIsPostAuthor = post && (post.userId === comment.userId || userIsPostCoauthor(comment.user, post))

  const displayReviewVoting = 
    !hideReviewVoteButtons &&
    reviewIsActive() &&
    comment.reviewingForReview === REVIEW_YEAR+"" &&
    post &&
    currentUser?._id !== post.userId &&
    eligibleToNominate(currentUser)

  /**
   * Show the moderator comment annotation if:
   * 1) it has the moderatorHat
   * 2) the user is either an admin, or the moderatorHat isn't deliberately hidden
   */
  const showModeratorCommentAnnotation = comment.moderatorHat && (
    userIsAdmin(currentUser)
      ? true
      : !comment.hideModeratorHat
    );
  
  const moderatorCommentAnnotation = comment.hideModeratorHat
    ? 'Moderator Comment (Invisible)'
    : 'Moderator Comment';
  
  const getReviewLink = (year: string) => {
    // We changed our review page in 2018 and 2019. In 2020 we came up with a page that we'll
    // hopefully stick with for awhile.
    if (year === "2018" || year === "2019") {
      return `/reviews/${year}`
    }
    return `/reviewVoting/${year}`
  }

  let relevantTagsTruncated = comment.relevantTags ?? []
  let shouldDisplayLoadMore = false
  if (!showMoreClicked) {
    shouldDisplayLoadMore = relevantTagsTruncated.length > 1 && !showMoreClicked
    relevantTagsTruncated = relevantTagsTruncated.slice(0,1)
  }

  return (
    <AnalyticsContext pageElementContext="commentItem" commentId={comment._id}>
      <div className={classNames(
        classes.root,
        "recent-comments-node",
        {
          [classes.deleted]: comment.deleted && !comment.deletedPublic,
          [classes.sideComment]: treeOptions.isSideComment,
          [classes.subforumTop]: comment.tagCommentType === "SUBFORUM" && !comment.topLevelCommentId,
        },
      )}>
        { comment.parentCommentId && showParentState && (
          <div className={classes.firstParentComment}>
            <Components.ParentCommentSingle
              post={post} tag={tag}
              documentId={comment.parentCommentId}
              nestingLevel={nestingLevel - 1}
              truncated={showParentDefault}
              key={comment.parentCommentId}
            />
          </div>
        )}
        
        <div className={classes.postTitleRow}>
          {showPinnedOnProfile && comment.isPinnedOnProfile && <div className={classes.pinnedIconWrapper}>
            <Components.ForumIcon icon="Pin" className={classes.pinnedIcon} />
          </div>}
          {moderatedCommentId === comment._id && <FlagIcon className={classes.flagIcon} />}
          {showPostTitle && !isChild && hasPostField(comment) && comment.post && <LWTooltip tooltip={false} title={<PostsPreviewTooltipSingle postId={comment.postId}/>}>
              <Link className={classes.postTitle} to={commentGetPageUrlFromIds({postId: comment.postId, commentId: comment._id, postSlug: ""})}>
                {comment.post.draft && "[Draft] "}
                {comment.post.title}
              </Link>
            </LWTooltip>}
          {showPostTitle && !isChild && hasTagField(comment) && comment.tag && <Link className={classes.postTitle} to={tagGetCommentLink({tagSlug: comment.tag.slug, tagCommentType: comment.tagCommentType})}>
            {startCase(comment.tag.name)}
          </Link>}
        </div>
        <div className={classes.body}>
          {showCommentTitle && <div className={classes.title}>
            {(displayTagIcon && tag) ? <span className={classes.tagIcon}>
              <CoreTagIcon tag={tag} />
            </span> : <CommentDiscussionIcon
              comment={comment}
            />}
            {comment.title}
          </div>}
          <div className={classNames(classes.meta, {
            [classes.sideCommentMeta]: treeOptions.isSideComment,
          })}>
            {!parentCommentId && !comment.parentCommentId && isParentComment &&
              <div className={classes.usernameSpacing}>○</div>
            }
            {post && <CommentShortformIcon comment={comment} post={post} />}
            {!showCommentTitle && <CommentDiscussionIcon comment={comment} small />}
            {!hideParentCommentToggle && parentCommentId!=comment.parentCommentId && parentAnswerId!=comment.parentCommentId &&
              <ShowParentComment
                comment={comment}
                active={showParentState}
                onClick={toggleShowParent}
            />}
            {(showCollapseButtons || collapsed) && <a className={classes.collapse} onClick={toggleCollapse}>
              [<span>{collapsed ? "+" : "-"}</span>]
            </a>}
            {singleLineCollapse && <a className={classes.collapse} onClick={() =>
              setSingleLine && setSingleLine(true)
            }>
              [<span>{collapsed ? "+" : "-"}</span>]
            </a>}
            <CommentUserName comment={comment} className={classes.username} isPostAuthor={authorIsPostAuthor} />
            <CommentsItemDate {...commentLinkProps} />
            {showModeratorCommentAnnotation && <span className={classes.moderatorHat}>
              {moderatorCommentAnnotation}
            </span>}
            <SmallSideVote
              document={comment}
              collection={Comments}
              hideKarma={post?.hideCommentKarma}
            />

            {post && <Components.CommentOutdatedWarning comment={comment} post={post}/>}

            {comment.nominatedForReview && <Link to={`/nominations/${comment.nominatedForReview}`} className={classes.metaNotice}>
              {`Nomination for ${comment.nominatedForReview} Review`}
            </Link>}

            {comment.reviewingForReview && <Link to={getReviewLink(comment.reviewingForReview)} className={classes.metaNotice}>
              {`Review for ${isEAForum && comment.reviewingForReview === '2020' ? 'the Decade' : comment.reviewingForReview} Review`}
            </Link>}

            {!!relevantTagsTruncated.length && <span className={classes.relevantTags}>
              {relevantTagsTruncated.map(tag =>
                <FooterTag
                  tag={tag}
                  key={tag._id}
                  className={classes.relevantTag}
                  neverCoreStyling
                  smallText
                />
              )}
              {shouldDisplayLoadMore && <LoadMore
                loadMore={() => setShowMoreClicked(true)}
                message="Show more"
                className={classes.showMoreTags}
              />}
            </span>}

            <span className={classes.rightSection}>
              {isEAForum &&
                <CommentLinkWrapper>
                  <Components.ForumIcon icon="Link" className={classes.linkIcon} />
                </CommentLinkWrapper>
              }
              {!isParentComment && !treeOptions.hideActionsMenu && renderMenu()}
            </span>
          </div>
          {comment.promoted && comment.promotedByUser && <div className={classes.metaNotice}>
            Pinned by {comment.promotedByUser.displayName}
          </div>}
          {renderBodyOrEditor()}
          {!comment.deleted && !collapsed && renderCommentBottom()}
        </div>
        {displayReviewVoting && !collapsed && <div className={classes.reviewVotingButtons}>
          <div className={classes.updateVoteMessage}>
            <LWTooltip title={`If this review changed your mind, update your ${REVIEW_NAME_IN_SITU} vote for the original post `}>
              Update your {REVIEW_NAME_IN_SITU} vote for this post. 
              <LWHelpIcon/>
            </LWTooltip>
          </div>
          {post && <ReviewVotingWidget post={post} showTitle={false}/>}
        </div>}
        { showReplyState && !collapsed && renderReply() }
      </div>
    </AnalyticsContext>
  )
}

const CommentsItemComponent = registerComponent(
  'CommentsItem', CommentsItem, {
    styles, hocs: [withErrorBoundary],
    areEqual: {
      treeOptions: "shallow",
    },
  }
);

function hasPostField(comment: CommentsList | CommentsListWithParentMetadata): comment is CommentsListWithParentMetadata {
  return !!(comment as CommentsListWithParentMetadata).post
}

function hasTagField(comment: CommentsList | CommentsListWithParentMetadata): comment is CommentsListWithParentMetadata {
  return !!(comment as CommentsListWithParentMetadata).tag
}

declare global {
  interface ComponentTypes {
    CommentsItem: typeof CommentsItemComponent,
  }
}
