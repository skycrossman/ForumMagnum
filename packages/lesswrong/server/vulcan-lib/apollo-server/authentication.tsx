import React from 'react'
import { createMutator, updateMutator } from "../mutators";
import passport from 'passport'
import bcrypt from 'bcrypt'
import { createHash, randomBytes } from "crypto";
import GraphQLLocalStrategy from "./graphQLLocalStrategy";
import sha1 from 'crypto-js/sha1';
import { addGraphQLMutation, addGraphQLSchema, addGraphQLResolvers, } from "../../../lib/vulcan-lib";
import { getForwardedWhitelist } from "../../forwarded_whitelist";
import { LWEvents } from "../../../lib/collections/lwevents";
import Users from "../../../lib/vulcan-users";
import { hashLoginToken, userIsBanned } from "../../loginTokens";
import { LegacyData } from '../../../lib/collections/legacyData/collection';
import { AuthenticationError } from 'apollo-server'
import { EmailTokenType } from "../../emails/emailTokens";
import { wrapAndSendEmail } from '../../emails/renderEmail';
import SimpleSchema from 'simpl-schema';
import { userEmailAddressIsVerified} from '../../../lib/collections/users/helpers';
import { getCookieFromReq, clearCookie } from '../../utils/httpUtil';
import { DatabaseServerSetting } from "../../databaseSettings";
import request from 'request';
import { forumTitleSetting } from '../../../lib/instanceSettings';
import { mongoFindOne } from '../../../lib/mongoQueries';
import {userFindOneByEmail} from "../../../lib/collections/users/commonQueries";
import { ClientIds } from "../../../lib/collections/clientIds/collection";

// Meteor hashed its passwords twice, once on the client
// and once again on the server. To preserve backwards compatibility
// with Meteor passwords, we do the same, but do it both on the server-side
function createMeteorClientSideHash(password: string) {
  return createHash('sha256').update(password).digest('hex')
}

async function createPasswordHash(password: string) {
  const meteorClientSideHash = createMeteorClientSideHash(password)
  return await bcrypt.hash(meteorClientSideHash, 10)
}


async function comparePasswords(password: string, hash: string) {
  return await bcrypt.compare(createMeteorClientSideHash(password), hash)
}

const passwordAuthStrategy = new GraphQLLocalStrategy(async function getUserPassport(username, password, done) {
  const user = await Users.findOne({$or: [{"emails.address": username}, {email: username}, {username: username}]});
  if (!user) return done(null, false, { message: 'Invalid login.' }); //Don't reveal that an email exists in DB
  
  // Load legacyData, if applicable. Needed because imported users had their
  // passwords hashed differently.
  // @ts-ignore -- legacyData isn't really handled right in our schemas.
  const legacyData = user.legacyData ? user.legacyData : await LegacyData.findOne({ objectId: user._id })?.legacyData;
  
  if (legacyData?.password && legacyData.password===password) {
    // For legacy accounts, the bcrypt-hashed password stored in user.services.password.bcrypt
    // is a hash of the LW1-hash of their password. Don't accept an LW1-hash as a password.
    // (If passwords from the DB were ever leaked, this prevents logging into legacy accounts
    // that never changed their password.)
    return done(null, false, { message: 'Incorrect password.' });
  }
  
  const match = !!user.services.password.bcrypt && await comparePasswords(password, user.services.password?.bcrypt);

  // If no immediate match, we check whether we have a match with their legacy password
  if (!match) {
    if (legacyData?.password) {
      const salt = legacyData.password.substring(0,3)
      const toHash = (`${salt}${user.username} ${password}`)
      const lw1PW = salt + sha1(toHash).toString();
      const lw1PWMatch = await comparePasswords(lw1PW, user.services.password.bcrypt);
      if (lw1PWMatch) return done(null, user)
    }
    return done(null, false, { message: 'Incorrect password.' });
  } 
  return done(null, user)
})

passport.use(passwordAuthStrategy)


function validatePassword(password:string): {validPassword: true} | {validPassword: false, reason: string} {
  if (password.length < 6) return { validPassword: false, reason: "Your password needs to be at least 6 characters long"}
  return { validPassword: true }
}

const loginData = `type LoginReturnData {
  token: String
}`

addGraphQLSchema(loginData);

type PassportAuthenticateCallback = Exclude<Parameters<typeof passport.authenticate>[2], undefined>;
// `options` should be `passport.AuthenticateOptions`, but those don't contain `username` and `password` in the type definition.
// No idea where they're actually coming from, in that case
function promisifiedAuthenticate(req: ResolverContext['req'], res: ResolverContext['res'], name: string, options: any, callback: PassportAuthenticateCallback) {
  return new Promise((resolve, reject) => {
    try {
      passport.authenticate(name, options, async (err, user, info) => {
        try {
          const callbackResult = await callback(err, user, info);
          resolve(callbackResult)
        } catch(err) {
          reject(err)
        }
      })(req, res)
    } catch(err) {
      reject(err)
    }
  })
}

export async function createAndSetToken(req, res, user) {
  const token = randomBytes(32).toString('hex');
  (res as any).setHeader("Set-Cookie", `loginToken=${token}; Max-Age=315360000; Path=/`);

  const hashedToken = hashLoginToken(token)
  await insertHashedLoginToken(user._id, hashedToken)

  registerLoginEvent(user, req)
  return token
}


const VerifyEmailToken = new EmailTokenType({
  name: "verifyEmail",
  onUseAction: async (user) => {
    if (userEmailAddressIsVerified(user)) return {message: "Your email address is already verified"}
    await updateMutator({ 
      collection: Users,
      documentId: user._id,
      set: {
        'emails.0.verified': true,
      } as any,
      unset: {},
      validate: false,
    });
    return {message: "Your email has been verified" };
  },
  resultComponentName: "EmailTokenResult"
});


export async function sendVerificationEmail(user: DbUser) {
  const verifyEmailLink = await VerifyEmailToken.generateLink(user._id);
  await wrapAndSendEmail({
    user, 
    subject: `Verify your ${forumTitleSetting.get()} email`,
    body: <div>
      <p>
        Click here to verify your {forumTitleSetting.get()} email
      </p>
      <p>
        <a href={verifyEmailLink}>
          {verifyEmailLink}
        </a>
      </p>
    </div>
  })
}

const ResetPasswordToken = new EmailTokenType({
  name: "resetPassword",
  onUseAction: async (user, params, args) => {
    if (!args) throw Error("Using a reset-password token requires providing a new password")
    const { password } = args
    const validatePasswordResponse = validatePassword(password)
    if (!validatePasswordResponse.validPassword) throw Error(validatePasswordResponse.reason)

    await updateMutator({ 
      collection: Users,
      documentId: user._id,
      set: {
        'services.password.bcrypt': await createPasswordHash(password),
        'services.resume.loginTokens': []
      } as any,
      unset: {},
      validate: false,
    });
    return {message: "Your new password has been set. Try logging in again." };
  },
  resultComponentName: "EmailTokenResult",
  path: "resetPassword" // Defined in routes.ts
});

const authenticationResolvers = {
  Mutation: {
    async login(root: void, { username, password }: {username: string, password: string}, { req, res }: ResolverContext) {
      let token:string | null = null

      await promisifiedAuthenticate(req, res, 'graphql-local', { username, password }, (err, user, info) => {
        return new Promise((resolve, reject) => {
          if (err) throw Error(err)
          if (!user) throw new AuthenticationError("Invalid username/password")
          if (userIsBanned(user)) throw new AuthenticationError("This user is banned")

          req!.logIn(user, async err => {
            if (err) throw new AuthenticationError(err)
            token = await createAndSetToken(req, res, user)
            resolve(token)
          })
        })
      })
      return { token }
    },
    async logout(root: void, args: {}, { req, res }: ResolverContext) {
      if (req) {
        req.logOut()
        clearCookie(req, res, "loginToken");
        clearCookie(req, res, "meteor_login_token");  
      }
      return {
        token: null
      }
    },
    async signup(root: void, args, context: ResolverContext) {
      const { email, username, password, subscribeToCurated, reCaptchaToken, abTestKey } = args;
      if (!email || !username || !password) throw Error("Email, Username and Password are all required for signup")
      if (!SimpleSchema.RegEx.Email.test(email)) throw Error("Invalid email address")
      const validatePasswordResponse = validatePassword(password)
      if (!validatePasswordResponse.validPassword) throw Error(validatePasswordResponse.reason)
      
      if (await userFindOneByEmail(email)) {
        throw Error("Email address is already taken");
      }
      if (await mongoFindOne("Users", { username })) {
        throw Error("Username is already taken");
      }

      const reCaptchaResponse = await getCaptchaRating(reCaptchaToken)
      const reCaptchaData = JSON.parse(reCaptchaResponse)
      let recaptchaScore : number | undefined = undefined
      if (reCaptchaData.success && reCaptchaData.action == "login/signup") {
        recaptchaScore = reCaptchaData.score
      } else {
        // eslint-disable-next-line no-console
        console.log("reCaptcha check failed:", reCaptchaData)
      }

      const { req, res } = context
      const { data: user } = await createMutator({
        collection: Users,
        document: {
          email,
          services: {
            password: {
              bcrypt: await createPasswordHash(password)
            },
            resume: {
              loginTokens: []
            }
          },
          emails: [{
            address: email, verified: false
          }],
          username: username,
          emailSubscribedToCurated: subscribeToCurated,
          signUpReCaptchaRating: recaptchaScore,
          abTestKey,
        },
        validate: false,
        currentUser: null,
        context
      })
      const token = await createAndSetToken(req, res, user)
      return { 
        token
      }
    },
    async resetPassword(root: void, { email }: {email: string}, context: ResolverContext) {
      if (!email) throw Error("Email is required for resetting passwords")
      const user = await userFindOneByEmail(email)
      if (!user) throw Error("Can't find user with given email address")
      const tokenLink = await ResetPasswordToken.generateLink(user._id)
      const emailSucceeded = await wrapAndSendEmail({
        user,
        subject: "Password Reset Request",
        body: <div>
          <p>
            You requested a password reset. Follow the following link to reset your password: 
          </p>
          <p>
            <a href={tokenLink}>{tokenLink}</a>
          </p>
        </div>
      });  
      if (emailSucceeded)
        return `Successfully sent password reset email to ${email}`; //FIXME: Is this revealing user emails that would otherwise be hidden?
      else
        return `Failed to send password reset email. The account might not have a valid email address configured.`;
    },
    async verifyEmail(root: void, { userId }: {userId: string}, context: ResolverContext) {
      if (!userId) throw Error("User ID is required for validating your email")
      const user = await Users.findOne({_id: userId})
      if (!user) throw Error("Can't find user with given ID")
      await sendVerificationEmail(user)
      return `Successfully sent verification email to ${user.displayName}`
    }
  } 
};

addGraphQLResolvers(authenticationResolvers);
addGraphQLMutation('login(username: String, password: String): LoginReturnData');
addGraphQLMutation('signup(username: String, email: String, password: String, subscribeToCurated: Boolean, reCaptchaToken: String, abTestKey: String): LoginReturnData');
addGraphQLMutation('logout: LoginReturnData');
addGraphQLMutation('resetPassword(email: String): String');
addGraphQLMutation('verifyEmail(userId: String): String');

async function insertHashedLoginToken(userId: string, hashedToken: string) {
  const tokenWithMetadata = {
    when: new Date(),
    hashedToken
  }

  await Users.rawUpdateOne({_id: userId}, {
    $addToSet: {
      "services.resume.loginTokens": tokenWithMetadata
    }
  });
};


function registerLoginEvent(user, req) {
  const document = {
    name: 'login',
    important: false,
    userId: user._id,
    properties: {
      type: 'passport-login',
      ip: getForwardedWhitelist().getClientIP(req),
      userAgent: req.headers['user-agent'],
      referrer: req.headers['referer']
    }
  }
  void createMutator({
    collection: LWEvents,
    document: document,
    currentUser: user,
    validate: false,
  })
  
  const clientId = getCookieFromReq(req, "clientId");
  if (clientId) {
    void recordAssociationBetweenUserAndClientID(clientId, user);
  }
}

async function recordAssociationBetweenUserAndClientID(clientId: string, user: DbUser) {
  const clientIdEntry = await ClientIds.findOne({clientId});
  if (clientIdEntry) {
    const userId = user._id;
    if (!clientIdEntry.userIds?.includes(userId)) {
      await ClientIds.rawUpdateOne({clientId}, {$set: {
        userIds: [...(clientIdEntry.userIds??[]), userId],
      }});
    }
  }
}

const reCaptchaSecretSetting = new DatabaseServerSetting<string | null>('reCaptcha.secret', null) // ReCaptcha Secret
export const getCaptchaRating = async (token: string): Promise<string> => {
  // Make an HTTP POST request to get reply text
  return new Promise((resolve, reject) => {
    request.post({url: 'https://www.google.com/recaptcha/api/siteverify',
        form: {
          secret: reCaptchaSecretSetting.get(),
          response: token
        }
      },
      function(err, httpResponse, body) {
        if (err) reject(err);
        return resolve(body);
      }
    );
  });
}
