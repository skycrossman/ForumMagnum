import { Components, registerComponent, withList} from 'meteor/vulcan:core';
import { Posts } from 'meteor/example-forum';
import React from 'react';
import { Error404 } from 'meteor/vulcan:core';

const PostsSingleSlug = (props) => {
<<<<<<< HEAD
  if (props.results && props.results[0]._id) {
    return <Components.PostsPage documentId={props.results[0]._id } />
  } else {
    return props.loading ? <Components.Loading/> : <Error404 />
=======
  console.log("ASDF", props.results)
  if (props.results && props.results[0]._id) {
    return <Components.PostsPage documentId={props.results[0]._id } />
  } else {
    return <Error404 />
>>>>>>> collectionsRouting
  }
};

PostsSingleSlug.displayName = "PostsSingleSlug";

const options = {
  collection: Posts,
  queryName: 'LWPostsPageSlugQuery',
  fragmentName: 'LWPostsPage',
  limit: 1,
  totalResolver: false,
};

registerComponent('PostsSingleSlug', PostsSingleSlug, [withList, options]);
