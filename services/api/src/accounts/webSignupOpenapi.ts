import { z } from 'zod'
import { describeRoute } from 'hono-openapi'
import {
  apiErrorSchema,
  b64u,
  buddiesId,
  errorResponse,
  jsonBody,
  jsonResponse,
} from '../openapi/schemas'
import { ACCOUNT_STATUSES } from './schema'
import {
  accountId,
  epochMs,
  internal,
  keySignedWith,
  sessionPlatformOf,
  tokenPair,
} from './openapi'
import {
  challengeToken,
  creationOptions,
  credentialId,
  passkeyFailed,
  rpId,
  signedErrors,
  webauthnResponse,
  wrapSchema,
} from './passkeyOpenapi'

/**
 * OpenAPI descriptions for accounts on the web (`/accounts/v1/web/*`,
 * witness-work `docs/passkeys-protocol.md`, "Web sign-up" and "Signing in
 * with a recovery key on the web"). Doc-only: the handlers keep their own
 * parsing.
 */

const turnstileToken = z.string().meta({
  description:
    'The Turnstile widget’s token (managed mode), at most 2,048 characters; it works once. The site key is `GET /app/v1/config`’s `webSignup.turnstileSiteKey`.',
})
const turnstileFailedSchema = apiErrorSchema
  .extend({
    reason: z.string().meta({
      description:
        'Siteverify’s first error code (`invalid-input-response`, `timeout-or-duplicate`, …), or `action-mismatch` or `hostname-mismatch` when the token was solved for another action or host.',
    }),
  })
  .meta({ id: 'TurnstileFailedError' })
const turnstileFailed = (description: string) =>
  errorResponse(description, ['turnstile_failed'], turnstileFailedSchema)
const webOff = (description: string) => ({
  503: errorResponse(description, ['disabled', 'unavailable']),
})
const registerTier =
  'Limits: the Buddies register tier (per caller IP, as for `inbox/register`).'
const capsText =
  'Caps: `WEB_SIGNUP_PER_IP_DAY` (3) per caller IP a rolling day, IPv6 by /64, and `WEB_SIGNUP_PER_ASN_HOUR` (30) per network a rolling hour, counted per network under keys that are HMACs of the IP or ASN with a key that changes daily.'

export const webSignupOptionsDocs = describeRoute({
  tags: ['Web sign-up'],
  summary: 'Start a web sign-up',
  description: `No auth. In order: 503 \`disabled\` while the kill switch is off (KV \`accounts:web-signup\`, then the \`WEB_SIGNUP\` var); the caps, checked only; then \`turnstileToken\` through Siteverify (action \`web-signup\`). Mints the new account’s id and user handle and binds both to a \`signup\` challenge (10 minutes); stores nothing.

${capsText} ${registerTier}`,
  requestBody: jsonBody(z.object({ turnstileToken, rpId: rpId.optional() })),
  responses: {
    200: jsonResponse(
      'The new account’s id and the passkey creation options.',
      z.object({
        ok: z.literal(true),
        accountId,
        challengeToken,
        options: creationOptions,
        userHandle: b64u('The new account’s user handle (`user.id`)'),
      })
    ),
    400: errorResponse('Malformed JSON, no `turnstileToken` (or one over 2,048 characters), or an RP ID the worker doesn’t list.', ['bad_request']),
    403: turnstileFailed('Siteverify refused the token.'),
    429: errorResponse('Over a cap or the per-caller rate (`Retry-After`).', ['rate_limited']),
    ...internal,
    ...webOff(
      'Sign-up is paused or off on this worker (`disabled`), or Siteverify couldn’t be reached (`unavailable`, `Retry-After`).'
    ),
  },
})

export const webSignupDocs = describeRoute({
  tags: ['Web sign-up'],
  summary: 'Finish a web sign-up',
  description: `Signed (op \`web/signup\`) by the account key the browser just made. Verifies the registration against the \`signup\` challenge, takes the caps (atomically, given back if the write fails; if they can’t be reached, 503 \`unavailable\` with \`Retry-After\`), then writes in one batch: the account (\`createdVia: web\`, the challenge’s id and user handle), the passkey, its wrap at key epoch 0 (with \`wrapId\` and \`wrap\` together), a web session (stepped up), and \`account.created\`, \`session.opened\` (\`method: signup\`) and \`passkey.added\`.

**A lost response:** after \`conflict\` for its own \`accountPub\`, or \`passkey_failed\` \`challenge\` for a challenge already used, sign in with the passkey just made.

The kill switch applies as for \`web/signup/options\`. ${capsText} The account key’s 20 session opens a day also apply. ${registerTier}`,
  requestBody: keySignedWith(
    'web/signup',
    {
      challengeToken,
      response: webauthnResponse('RegistrationResponseJSON'),
      wrapId: buddiesId('The wrap’s id, with `wrap`').optional(),
      wrap: wrapSchema.optional(),
      label: b64u('The browser’s label, sealed like a session’s `device`, at most 512 characters').optional(),
      device: b64u('The session’s sealed device label, at most 512 characters').optional(),
      appVersion: z.string().optional().meta({ description: 'The web app’s version, at most 32 characters.' }),
      capabilities: z.array(z.string()).optional().meta({ description: 'Like a session open’s `capabilities`.' }),
    },
    ' The key is the new account’s, and the envelope works once (409 `replay`).'
  ),
  responses: {
    201: {
      ...jsonResponse(
        'The account and its first web session.',
        z.object({
          ok: z.literal(true),
          accountId,
          status: z.enum(ACCOUNT_STATUSES),
          sessionId: buddiesId('The session'),
          platform: sessionPlatformOf,
          ...tokenPair,
          credentialId,
        })
      ),
      headers: {
        Location: {
          description: '`/accounts/v1/sessions/current`.',
          schema: { type: 'string' as const },
        },
      },
    },
    400: errorResponse('Malformed envelope, payload, or response.', ['bad_request']),
    401: signedErrors[401],
    ...passkeyFailed('The registration didn’t verify, or the challenge isn’t a `signup` one, expired, or was used (`reason`).'),
    409: errorResponse('The envelope’s key already has an account, or the credential is stored already (`conflict`), or this envelope was already used (`replay`).', ['conflict', 'replay']),
    413: errorResponse('`response` over 16 KiB, or `label` or `device` over 512 characters.', ['too_large']),
    429: errorResponse('Over a cap, the key’s session opens, or the per-caller rate (`Retry-After`).', ['rate_limited']),
    ...internal,
    ...webOff('Sign-up is paused or off on this worker (`disabled`), or the caps can’t be counted (`unavailable`, `Retry-After`).'),
  },
})

export const webRecoveryDocs = describeRoute({
  tags: ['Web sign-up'],
  summary: 'Sign in on the web with a recovery key',
  description: `Signed (op \`web/recovery\`) by the account key the recovery key derives. \`WEB_RECOVERY_PER_IP_DAY\` (10) per caller IP a rolling day, checked first and counted only once \`turnstileToken\` passed Siteverify (action \`web-recovery\`), so a refused token never counts; then a \`recovery\` ticket (2 minutes) to open a web session with (\`POST /accounts/v1/sessions\`). A key without an account is \`unknown_account\`: the web never creates an account from a recovery key. The sign-up kill switch doesn’t apply.

${registerTier}`,
  requestBody: keySignedWith(
    'web/recovery',
    { turnstileToken },
    ' The envelope works once (409 `replay`).'
  ),
  responses: {
    200: jsonResponse(
      'The ticket.',
      z.object({
        ok: z.literal(true),
        accountId,
        ticket: z.string().meta({ description: 'A `recovery` ticket, at most 512 characters; it works once.' }),
        ticketExpiresAt: epochMs('When the ticket expires'),
      })
    ),
    ...signedErrors,
    403: turnstileFailed('Siteverify refused the token.'),
    404: errorResponse('No account has the envelope’s key.', ['unknown_account']),
    409: errorResponse('This envelope was already used; sign a new one.', ['replay']),
    429: errorResponse('10 recoveries from this IP in a day, or over the per-caller rate (`Retry-After`).', ['rate_limited']),
    ...internal,
    ...webOff('Accounts or Turnstile are off on this worker (`disabled`), or Siteverify couldn’t be reached (`unavailable`).'),
  },
})
