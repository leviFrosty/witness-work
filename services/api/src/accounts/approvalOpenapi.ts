import { z } from 'zod'
import { describeRoute } from 'hono-openapi'
import {
  b64u,
  buddiesId,
  errorResponse,
  jsonBody,
  jsonResponse,
} from '../openapi/schemas'
import { accountId, epochMs, internal, okOnly, readTier } from './openapi'
import { bearerOnly, rateLimited, unauthorized } from './passkeyOpenapi'

/**
 * OpenAPI descriptions for approving a browser from a phone
 * (`/accounts/v1/approval/*`, witness-work `docs/passkeys-protocol.md`).
 * Doc-only: the handlers and `AccountApproval` keep their own parsing.
 * Channel ids and tokens travel in bodies, never URLs.
 */

const approvalChannelId = buddiesId('The channel id from the QR code, 16 bytes')
const browserToken = buddiesId('The browser’s token, 16 random bytes it keeps')
const approvalStatus = z.enum(['open', 'claimed', 'sent', 'done', 'cancelled'])
const approvalExpiresAt = epochMs('When the channel expires (75 seconds from `open` unclaimed, 5 minutes from the claim)')
const approvalWhy =
  'Plain JSON: the browser’s ops carry `browserToken` (`open` nothing); the phone’s are Bearer requests of the session that claimed. Ids travel in bodies, never URLs.'
const approvalTokenErrors = {
  400: errorResponse('Malformed JSON or field.', ['bad_request']),
  401: errorResponse(
    'A wrong `claimToken` or `browserToken` (`bad_signature`; the fifth burns a channel in progress, and a finished one keeps its status), or a missing, expired, or ended session’s token (`unauthorized`).',
    ['bad_signature', 'unauthorized']
  ),
  404: errorResponse('No such channel, or it expired.', ['not_found']),
}
const approvalOff = {
  503: errorResponse('Accounts or tickets are off on this worker.', ['disabled']),
}
const phoneOnly =
  'Only the phone session that claimed may do this (`forbidden` otherwise, and for every web session).'

export const approvalOpenDocs = describeRoute({
  tags: ['Approving a browser'],
  summary: 'Open an approval channel (browser)',
  description: `The browser, which has no account yet, opens the channel its QR code names, with the verifiers of the phone’s \`claimToken\` and its own \`browserToken\` and its sealed hello. The channel keeps the coarse location Cloudflare gives this request (city, region, country, latitude, longitude; never the IP) for its lifetime. Open a new channel every 60 seconds while the code shows. ${approvalWhy}

Limits: the Buddies register tier, and 60 per caller IP a rolling hour (\`rate_limited\`, \`Retry-After\`).`,
  requestBody: jsonBody(
    z.object({
      channelId: approvalChannelId,
      verifier: b64u('`b64u(SHA-256(claimToken))`, 32 bytes'),
      browserVerifier: b64u('`b64u(SHA-256(browserToken))`, 32 bytes'),
      hello: b64u('The hello, sealed with `helloKey`, at most 1,024 characters'),
    })
  ),
  responses: {
    200: jsonResponse('Open.', z.object({ ok: z.literal(true), expiresAt: approvalExpiresAt })),
    400: errorResponse('Malformed JSON or field.', ['bad_request']),
    409: errorResponse('The channel is live already.', ['conflict']),
    413: errorResponse('`hello` is over 1,024 characters.', ['too_large']),
    ...rateLimited,
    ...internal,
    ...approvalOff,
  },
})

export const approvalClaimDocs = describeRoute({
  tags: ['Approving a browser'],
  summary: 'Claim an approval channel (phone)',
  description: `A phone’s live session (Bearer; a web session is \`forbidden\`) claims the channel with \`claimToken\` from the QR code and its temporary X25519 public key. The first valid claim wins and the channel then lives 5 minutes; the same claim again from the same session gets \`ok\` again; any other is \`conflict\`. Answers the sealed hello, where the browser is, and \`far\`: the phone’s request is in another country, or more than 200 km away by haversine (\`false\` when either side is unknown). \`far\` is a hint for a warning, not a control. A suspended account can still approve.

${readTier}`,
  security: bearerOnly,
  requestBody: jsonBody(
    z.object({
      channelId: approvalChannelId,
      claimToken: buddiesId('`HKDF-SHA256(secret, "", "ww-account/v1/approval/claim\\n" + channelId, 16)`'),
      phonePub: b64u('The phone’s temporary X25519 public key, 32 bytes'),
    })
  ),
  responses: {
    200: jsonResponse(
      'Claimed (or the same claim again).',
      z.object({
        ok: z.literal(true),
        expiresAt: approvalExpiresAt,
        hello: b64u('The browser’s sealed hello'),
        location: z
          .object({ city: z.string().optional(), region: z.string().optional(), country: z.string().optional() })
          .optional()
          .meta({ description: 'Where the browser opened the channel; absent when Cloudflare didn’t say.' }),
        far: z.boolean(),
      })
    ),
    ...approvalTokenErrors,
    403: errorResponse('A web session.', ['forbidden']),
    409: errorResponse('Another phone claimed it, or it ended.', ['conflict']),
    ...rateLimited,
    ...internal,
    ...approvalOff,
  },
})

export const approvalStatusDocs = describeRoute({
  tags: ['Approving a browser'],
  summary: 'Read an approval channel',
  description: `The browser (with \`browserToken\`) polls it every 1.5 seconds while the code shows; once \`claimed\` it has the phone’s public key and shows the six-digit code. The phone may read it with the claiming session’s Bearer token. ${phoneOnly}

${readTier}`,
  security: [{}, { bearerAuth: [] }],
  requestBody: jsonBody(z.object({ channelId: approvalChannelId, browserToken: browserToken.optional() })),
  responses: {
    200: jsonResponse(
      'The channel.',
      z.object({
        ok: z.literal(true),
        status: approvalStatus,
        expiresAt: approvalExpiresAt,
        phonePub: b64u('The phone’s temporary public key, once claimed').optional(),
      })
    ),
    ...approvalTokenErrors,
    403: errorResponse(phoneOnly, ['forbidden']),
    ...rateLimited,
    ...internal,
    ...approvalOff,
  },
})

export const approvalSendDocs = describeRoute({
  tags: ['Approving a browser'],
  summary: 'Send the account key to the browser (phone)',
  description: `The claiming phone session sends the account key sealed with \`keyKey\`, once the User said Yes and passed the device check. Only while \`claimed\` (\`conflict\` otherwise); the same \`key\` again is \`ok\` (a lost response). Logs \`device.approved\` with the phone’s session. ${phoneOnly}

${readTier}`,
  security: bearerOnly,
  requestBody: jsonBody(
    z.object({
      channelId: approvalChannelId,
      key: b64u('The key blob, sealed with `keyKey`, at most 1,024 characters'),
    })
  ),
  responses: {
    200: okOnly,
    ...approvalTokenErrors,
    403: errorResponse(phoneOnly, ['forbidden']),
    409: errorResponse('Not claimed, or already sent another key, or ended.', ['conflict']),
    413: errorResponse('`key` is over 1,024 characters.', ['too_large']),
    ...rateLimited,
    ...internal,
    ...approvalOff,
  },
})

export const approvalReceiveDocs = describeRoute({
  tags: ['Approving a browser'],
  summary: 'Receive the account key (browser)',
  description: `The browser polls it every 1.5 seconds once the channel is claimed. While \`sent\`, it answers the sealed key and an \`approval\` ticket for the phone’s account (2 minutes), minted at the first such \`receive\`; a repeat answers the same ticket until it expires. Open the web session with it (\`POST /accounts/v1/sessions\`), check its \`accountId\` is the sealed one, then call \`done\`.

${readTier}`,
  requestBody: jsonBody(z.object({ channelId: approvalChannelId, browserToken })),
  responses: {
    200: jsonResponse(
      'The channel, and the key and ticket while `sent`.',
      z.object({
        ok: z.literal(true),
        status: approvalStatus,
        key: b64u('The sealed key blob').optional(),
        ticket: z.string().optional().meta({ description: 'An `approval` ticket, at most 512 characters; it works once.' }),
        ticketExpiresAt: epochMs('When the ticket expires').optional(),
      })
    ),
    ...approvalTokenErrors,
    ...rateLimited,
    ...internal,
    ...approvalOff,
  },
})

export const approvalDoneDocs = describeRoute({
  tags: ['Approving a browser'],
  summary: 'Finish an approval (browser)',
  description: `The browser has the key: the channel drops the key, the hello, the location, and the ticket, and keeps only its status until it expires. \`conflict\` before \`sent\`; repeating it is \`ok\`.

${readTier}`,
  requestBody: jsonBody(z.object({ channelId: approvalChannelId, browserToken })),
  responses: {
    200: okOnly,
    ...approvalTokenErrors,
    409: errorResponse('Not sent yet, or cancelled.', ['conflict']),
    ...rateLimited,
    ...internal,
    ...approvalOff,
  },
})

export const approvalCancelDocs = describeRoute({
  tags: ['Approving a browser'],
  summary: 'Cancel an approval',
  description: `Either side ends the channel and it drops everything but its status (the claiming phone can still read it): the browser with \`browserToken\` (say, for its other rotating channels once one is claimed), or the claiming phone session (No). Idempotent, and a no-op once \`done\`. ${phoneOnly}

${readTier}`,
  security: [{}, { bearerAuth: [] }],
  requestBody: jsonBody(z.object({ channelId: approvalChannelId, browserToken: browserToken.optional() })),
  responses: {
    200: okOnly,
    ...approvalTokenErrors,
    403: errorResponse(phoneOnly, ['forbidden']),
    ...rateLimited,
    ...internal,
    ...approvalOff,
  },
})
