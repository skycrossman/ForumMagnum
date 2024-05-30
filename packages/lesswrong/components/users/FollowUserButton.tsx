import { useTracking } from '@/lib/analyticsEvents';
import { Components, registerComponent } from '@/lib/vulcan-lib';
import React from 'react';
import { useNotifyMe } from '../hooks/useNotifyMe';
import { useOptimisticToggle } from '../hooks/useOptimisticToggle';
import { commentBodyStyles } from '@/themes/stylePiping';
import classNames from 'classnames';
import { userGetDisplayName } from '@/lib/collections/users/helpers';

const styles = (theme: ThemeType) => ({
  root: {
    ...theme.typography.commentStyle,
    color: theme.palette.primary.main,
    //add style to indicate item is clickable
    cursor: "pointer",
  },
  subscribed: {
    color: "unset",
  }
});

export const FollowUserButton = ({user, classes}: {
  user: UsersMinimumInfo,
  classes: ClassesType<typeof styles>,
}) => {

  const { LWTooltip } = Components;
  const { captureEvent } = useTracking();

  const {isSubscribed, onSubscribe, disabled } = useNotifyMe({
    document: user,
    overrideSubscriptionType: "newActivityForFeed",
    hideFlashes: true,
  });

  const [subscribed, toggleSubscribed] = useOptimisticToggle(
    isSubscribed ?? false,
    onSubscribe ?? (() => {}),
  );

  const handleSubscribe = (ev: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    void toggleSubscribed(ev);
    captureEvent("followUserButtonClick", {subcribedToUser: user._id, subscribed: !subscribed})
  }

  const followTooltip = `${userGetDisplayName(user)}}'s content will appear in your subscribed tab feed`

  if (disabled) {
    return null;
  }

  return <div className={classNames(classes.root, {[classes.subscribed]: subscribed})} onClick={handleSubscribe}>
    <LWTooltip title={followTooltip} placement="top" disabled={subscribed}>
      {subscribed ? "Unfollow" : "Follow"}
    </LWTooltip>
  </div>;
}

const FollowUserButtonComponent = registerComponent('FollowUserButton', FollowUserButton, {styles});

declare global {
  interface ComponentTypes {
    FollowUserButton: typeof FollowUserButtonComponent
  }
}
