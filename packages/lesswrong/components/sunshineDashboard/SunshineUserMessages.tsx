import React, { useState } from 'react';
import { useTracking } from '../../lib/analyticsEvents';
import { useMulti } from '../../lib/crud/withMulti';
import { registerComponent, Components } from '../../lib/vulcan-lib';
import { TemplateQueryStrings } from '../messaging/NewConversationButton';
import EmailIcon from '@material-ui/icons/Email';
import { Link } from '../../lib/reactRouterWrapper';

const styles = (theme: JssStyles) => ({
  row: {
    display: "flex",
    alignItems: "center"
  },
  icon: {
    height: 13,
    width: 13,
    position: "relative",
    top: 2,
    marginRight: 3,
  }
})

export const SunshineUserMessages = ({classes, user, currentUser}: {
  user: SunshineUsersList,
  classes: ClassesType,
  currentUser: UsersCurrent,
}) => {
  const { SunshineSendMessageWithDefaults, NewMessageForm, UsersName, LWTooltip, MetaInfo } = Components
  const [embeddedConversationId, setEmbeddedConversationId] = useState<string | undefined>();
  const [templateQueries, setTemplateQueries] = useState<TemplateQueryStrings | undefined>();

  const { captureEvent } = useTracking()

  const embedConversation = (conversationId: string, templateQueries: TemplateQueryStrings) => {
    setEmbeddedConversationId(conversationId)
    setTemplateQueries(templateQueries)
  }

  const { results } = useMulti({
    terms: {view: "moderatorConversations", userId: user._id},
    collectionName: "Conversations",
    fragmentName: 'conversationsListFragment',
    fetchPolicy: 'cache-and-network',
    enableTotal: true
  });

  return <div className={classes.root}>
    {results?.map(conversation => <LWTooltip title={`${conversation.messageCount} messages in this conversation`} key={conversation._id}>
      <Link to={`/inbox/${conversation._id}`}>
        <MetaInfo><EmailIcon className={classes.icon}/> {conversation.messageCount}</MetaInfo>
        <span className={classes.title}>
          Conversation with{" "} 
          {conversation.participants?.map(participant => {
            if (participant._id !== user._id) return <UsersName simple user={participant} key={`${conversation._id}${user._id}`}/>
          })}
        </span>
      </Link>
    </LWTooltip>)}
    <SunshineSendMessageWithDefaults 
        user={user} 
        embedConversation={embedConversation}
      />
    {embeddedConversationId && <div>
      <NewMessageForm 
        conversationId={embeddedConversationId} 
        templateQueries={templateQueries}
        successEvent={() => {
          captureEvent('messageSent', {
            conversationId: embeddedConversationId,
            sender: currentUser._id,
            moderatorConveration: true
          })
        }}
      />
    </div>}
  </div>;
}

const SunshineUserMessagesComponent = registerComponent('SunshineUserMessages', SunshineUserMessages, {styles});

declare global {
  interface ComponentTypes {
    SunshineUserMessages: typeof SunshineUserMessagesComponent
  }
}
