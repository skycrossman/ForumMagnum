import { foreignKeyField } from '../../utils/schemaUtils'
import { schemaDefaultValue } from '../../collectionUtils';
import { userOwns } from '../../vulcan-users/permissions';
import SimpleSchema from 'simpl-schema';

export interface JobAdsType {
  state: 'seen'|'expanded'|'interested'|'uninterested'
  uninterestedReason?: string
  lastUpdated: Date
}
const jobAdsType = new SimpleSchema({
  state: {
    type: String,
    allowedValues: ['seen', 'expanded', 'interested', 'uninterested'],
  },
  uninterestedReason: {
    type: String,
    optional: true,
    nullable: true
  },
  lastUpdated: {
    type: Date,
    optional: true
  },
})

const schema: SchemaType<DbAdvisorRequest> = {
  userId: {
    ...foreignKeyField({
      idFieldName: "userId",
      resolverName: "user",
      collectionName: "Users",
      type: "User",
      nullable: true,
    }),
    hidden: true,
    insertableBy: ['members', 'admins'],
    viewableBy: [userOwns, 'admins'],
    editableBy: [userOwns, 'admins'],
  },
  interestedInMetaculus: {
    type: Boolean,
    optional: true,
    hidden: true,
    insertableBy: ['members', 'admins'],
    viewableBy: [userOwns, 'admins'],
    editableBy: [userOwns, 'admins'],
    ...schemaDefaultValue(false),
  },
  jobAds: {
    type: Object,
    optional: true,
    hidden: true,
    blackbox: true,
    insertableBy: ['members', 'admins'],
    viewableBy: [userOwns, 'admins'],
    editableBy: [userOwns, 'admins'],
  },
  'jobAds.$': {
    type: jobAdsType,
    viewableBy: ['members'],
  },
};

export default schema;
