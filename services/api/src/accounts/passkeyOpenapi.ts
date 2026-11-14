import { z } from 'zod'
import { describeRoute } from 'hono-openapi'
import {
  apiErrorSchema,
  b64u,
  buddiesId,
  errorResponse,
  jsonBody,
  jsonResponse,
  staleErrorSchema,
} from '../openapi/schemas'
import { ACCOUNT_STATUSES, PASSKEY_PLATFORMS } from './schema'
import {
  accountId,
  epochMs,
  internal,
  keySignedWith,
  okOnly,
  readTier,
} from './openapi'
import { PASSKEY_FAILURE_REASONS } from './webauthn'

/**
 * OpenAPI descriptions for the passkey routes (`/accounts/v1/passkeys*`,
 * witness-work `docs/passkeys-protocol.md`). Doc-only: the handlers keep
 * their own parsing. Credential ids travel in bodies, never URLs, so removal
 * is `POST /passkeys/remove` rather than `DELETE /passkeys/{id}`.
 */

export const credentialId = b64u('The credential id (`rawId`), base64url')
const passkeysOff = {
  503: errorResponse(
    'Passkeys are off on this worker (no accounts database, token secret, RP config, or challenge and ticket secrets).',
    ['disabled']
  ),
}
export const rateLimited = {
  429: errorResponse('Over the per-caller rate.', ['rate_limited']),
}
export const bearerOnly = [{ bearerAuth: [] }]
export const unauthorized = {
  401: errorResponse(
    'Missing, expired, or invalid token, or a token whose session has ended (`WWW-Authenticate: Bearer error="invalid_token"`).',
    ['unauthorized']
  ),
}
export const signedErrors = {
  400: errorResponse('Malformed JSON, envelope, or field.', ['bad_request']),
  401: errorResponse(
    'The token is missing, expired, invalid, or its session ended (`unauthorized`); or the envelope’s signature is bad (`bad_signature`) or its `ts` more than 5 minutes off (`stale`).',
    ['unauthorized', 'bad_signature', 'stale'],
    staleErrorSchema
  ),
}

const passkeyFailedSchema = apiErrorSchema
  .extend({
    reason: z.enum(PASSKEY_FAILURE_REASONS).meta({
      description:
        'Which check failed: `challenge` (wrong, used, or expired challenge, or client data for another challenge), `unknown_credential`, `user_handle`, `origin` (not paired with the challenge’s RP ID), `rp_id` (`rpIdHash` for another RP ID), `user_presence` (no UP flag), `user_verification` (no UV flag), `signature` (the signature didn’t verify, or a create’s client data answered a get), `counter` (a non-zero counter that didn’t increase), or `registration` (the attestation didn’t verify, a get’s client data answered a create, or the account’s user handle changed).',
    }),
  })
  .meta({ id: 'PasskeyFailedError' })

export const passkeyFailed = (description: string) => ({
  403: errorResponse(description, ['passkey_failed'], passkeyFailedSchema),
})

const stepUpRequired =
  'A web session must have passed a step-up (`POST /passkeys/assert` with a `step-up` challenge) or opened in the last 5 minutes (`step_up_required` otherwise); phone sessions are exempt.'

export const rpId = z.string().meta({
  description:
    'The RP ID. Absent, it’s the one the request’s `Origin` pairs with (a browser on `http://localhost:8081` gets `localhost` on a local development worker), else the worker’s first (`app.witnesswork.app` on production; `beta.app.witnesswork.app` on Beta and on a local development worker, whose native development builds borrow it). One the worker doesn’t list is `bad_request`.',
})

const signedWith = (op: string, fields: z.ZodRawShape) =>
  keySignedWith(
    op,
    fields,
    ' Its key must be the token’s own account (`forbidden` otherwise), and each envelope works once (409 `replay`): sign a new one to retry.'
  )

export const wrapSchema = z.string().meta({
  description:
    'The account key sealed under the passkey’s PRF output: `b64u(0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(wrapKey, nonce, accountKey, aad))`, 98 characters (see the protocol’s Keys).',
})
const wrapView = z.object({
  wrapId: buddiesId('The wrap’s id (16 random bytes the device made)'),
  wrap: wrapSchema,
  keyEpoch: z.number().int().meta({ description: 'The key epoch it was made under.' }),
})

export const challengeToken = z.string().meta({
  description:
    'Opaque; send it back with the response. One purpose, one RP ID (and for `step-up` and `register`, one session); 5 minutes; works once.',
})

const requestOptions = z.object({}).passthrough().meta({
  description:
    '`PublicKeyCredentialRequestOptionsJSON`: `challenge`, `timeout` (300,000), `rpId`, `allowCredentials`, `userVerification: "required"`. Never `extensions.prf`; the client adds `prf: { eval: { first: salt } }` itself.',
})
export const creationOptions = z.object({}).passthrough().meta({
  description:
    '`PublicKeyCredentialCreationOptionsJSON`: `rp` (`name: "WitnessWork"`), `user` (the account’s user handle, `name` and `displayName` `WitnessWork <tag>`), `challenge`, `pubKeyCredParams` (EdDSA, ES256, RS256), `timeout` (300,000), `excludeCredentials` (the account’s passkeys), `authenticatorSelection` (`residentKey: "required"`, `userVerification: "required"`), `attestation: "none"`. Never `extensions.prf`.',
})

export const webauthnResponse = (kind: string) =>
  z.object({}).passthrough().meta({
    description: `WebAuthn’s \`${kind}\`, base64url throughout, at most 16 KiB (\`too_large\`). Drop \`clientExtensionResults.prf\` before sending; the server never sees PRF output.`,
  })

export const passkeyChallengeDocs = describeRoute({
  tags: ['Passkeys'],
  summary: 'Get a passkey challenge',
  description: `\`purpose: "sign-in"\` needs no auth and answers \`allowCredentials: []\` (discoverable sign-in). \`purpose: "step-up"\` needs a Bearer token and lists the account’s passkeys for the RP ID in \`allowCredentials\`. Issuing a challenge stores nothing.

${readTier}`,
  security: [{}, { bearerAuth: [] }],
  requestBody: jsonBody(
    z.object({
      purpose: z.enum(['sign-in', 'step-up']),
      rpId: rpId.optional(),
    })
  ),
  responses: {
    200: jsonResponse(
      'The challenge.',
      z.object({ ok: z.literal(true), challengeToken, options: requestOptions })
    ),
    400: errorResponse('Malformed JSON, an unknown `purpose`, or an RP ID the worker doesn’t list.', ['bad_request']),
    ...unauthorized,
    ...rateLimited,
    ...internal,
    ...passkeysOff,
  },
})

export const passkeyAssertDocs = describeRoute({
  tags: ['Passkeys'],
  summary: 'Verify a passkey assertion',
  description: `Verifies the challenge, the credential, the user handle (the credential’s account’s), the origin and RP ID as a pair, user presence and verification, the counter, and the signature; then stores the counter (never lowered: a synced passkey’s 0 leaves it), the backup flags, and \`lastUsedAt\`.

**Sign-in** (a \`sign-in\` challenge, no auth): answers the account and every wrap of the credential for the account’s current \`keyEpoch\`, newest first (empty for a sign-in-only passkey), and a \`passkey\` ticket a browser opens its web session with (\`POST /accounts/v1/sessions\`); none for an \`android:apk-key-hash:\` origin, since phones attest. A suspended account still signs in.

**Step-up** (a \`step-up\` challenge, with the Bearer token of the session it was issued to): records \`stepUpAt\` and the credential on the session. No ticket.

Failed assertions count against a budget of 30 per caller IP an hour (\`rate_limited\`, with a \`Retry-After\` never past the hour). ${readTier}`,
  security: [{}, { bearerAuth: [] }],
  requestBody: jsonBody(
    z.object({ challengeToken, response: webauthnResponse('AuthenticationResponseJSON') })
  ),
  responses: {
    200: jsonResponse(
      'Verified. Sign-in answers the account; step-up answers `credentialId` and `stepUpAt` only.',
      z.object({
        ok: z.literal(true),
        accountId: accountId.optional(),
        accountPub: b64u('The account’s public key; check an opened wrap derives it').optional(),
        status: z.enum(ACCOUNT_STATUSES).optional(),
        keyEpoch: z.number().int().optional(),
        credentialId,
        userHandle: b64u('The account’s user handle').optional(),
        wraps: z.array(wrapView).optional(),
        ticket: z.string().optional().meta({
          description: 'A `passkey` ticket, at most 512 characters, valid 2 minutes. Absent for Android origins.',
        }),
        ticketExpiresAt: epochMs('When the ticket expires').optional(),
        stepUpAt: epochMs('Step-up: when it was recorded').optional(),
      })
    ),
    400: errorResponse('Malformed JSON or response.', ['bad_request']),
    ...unauthorized,
    ...passkeyFailed('The assertion didn’t verify; `reason` says why.'),
    413: errorResponse('`response` is over 16 KiB.', ['too_large']),
    429: errorResponse('Over the per-caller rate, or 30 failed assertions from this IP in the last hour.', ['rate_limited']),
    ...internal,
    ...passkeysOff,
  },
})

export const passkeyRegisterOptionsDocs = describeRoute({
  tags: ['Passkeys'],
  summary: 'Get passkey creation options',
  description: `The options to create a passkey for the token’s account, with the account’s user handle (32 random bytes, minted the first time with a conditional write, so two devices asking at once get the same one) and its passkeys in \`excludeCredentials\`. Use them as given; the name is frozen at creation.

${readTier}`,
  security: bearerOnly,
  requestBody: jsonBody(z.object({ rpId: rpId.optional() })),
  responses: {
    200: jsonResponse(
      'The options.',
      z.object({
        ok: z.literal(true),
        challengeToken,
        options: creationOptions,
        userHandle: b64u('The account’s user handle (`user.id`)'),
      })
    ),
    400: errorResponse('Malformed JSON, or an RP ID the worker doesn’t list.', ['bad_request']),
    ...unauthorized,
    ...rateLimited,
    ...internal,
    ...passkeysOff,
  },
})

export const passkeyAddDocs = describeRoute({
  tags: ['Passkeys'],
  summary: 'Add a passkey',
  description: `Bearer **and** signed (op \`passkey/add\`), on a live session. ${stepUpRequired}

Stores the registration from \`register/options\`, and optionally a wrap (\`wrapId\` and \`wrap\` together, at the account’s key epoch). Send it at once after creating the passkey, without a wrap, so the server knows every passkey the password manager keeps; save the wrap later with \`POST /passkeys/wrap\`. The challenge’s user handle must still be the account’s (\`registration\`). At most 10 passkeys an account (\`limit\`), counted in the insert itself, so parallel adds can’t pass it. A credential already stored for this account is \`ok\` with its \`credentialId\` (a lost response); for another account, \`conflict\`. Logs \`passkey.added\`.

${readTier}`,
  security: bearerOnly,
  requestBody: signedWith('passkey/add', {
    challengeToken,
    response: webauthnResponse('RegistrationResponseJSON'),
    wrapId: buddiesId('The wrap’s id, with `wrap`').optional(),
    wrap: wrapSchema.optional(),
    label: b64u('The creating device’s label, sealed like a session’s `device`, at most 512 characters').optional(),
  }),
  responses: {
    200: jsonResponse('Stored (or already was).', z.object({ ok: z.literal(true), credentialId })),
    ...signedErrors,
    403: errorResponse(
      `The registration didn’t verify (\`passkey_failed\` with \`reason\`), the envelope is another account’s (\`forbidden\`), or the web session needs a step-up (\`step_up_required\`).`,
      ['passkey_failed', 'forbidden', 'step_up_required'],
      passkeyFailedSchema
    ),
    404: errorResponse('No account has the envelope’s key.', ['unknown_account']),
    409: errorResponse('The credential is another account’s (`conflict`), or this envelope was already used (`replay`; sign a new one).', ['conflict', 'replay']),
    413: errorResponse('`response` over 16 KiB, or `label` over 512 characters.', ['too_large']),
    429: errorResponse('Ten passkeys already (`limit`), or over the per-caller rate.', ['limit', 'rate_limited']),
    ...internal,
    ...passkeysOff,
  },
})

export const passkeyWrapDocs = describeRoute({
  tags: ['Passkeys'],
  summary: 'Save a passkey wrap',
  description: `Bearer **and** signed (op \`passkey/wrap\`), on a live session. Stores the account key sealed under this passkey’s PRF output, so the passkey unlocks the account next time. \`wrapId\` is 16 random bytes made once per wrap, unique per credential; repeating it on the same credential is \`ok\` and stores nothing new. A \`keyEpoch\` that isn’t the account’s is \`conflict\`, so a device still holding a replaced key can’t save a wrap for it. A credential keeps up to 4 wraps; a fifth replaces the oldest. A credential of another account, or none, is \`not_found\`. Not logged.

${readTier}`,
  security: bearerOnly,
  requestBody: signedWith('passkey/wrap', {
    credentialId,
    wrapId: buddiesId('The wrap’s id'),
    keyEpoch: z.number().int().meta({ description: 'The account’s key epoch the wrap was made under.' }),
    wrap: wrapSchema,
  }),
  responses: {
    200: okOnly,
    ...signedErrors,
    403: errorResponse('The envelope is another account’s.', ['forbidden']),
    404: errorResponse('No such credential on this account, or no account has the envelope’s key.', ['not_found', 'unknown_account']),
    409: errorResponse('Another key epoch (`conflict`), or this envelope was already used (`replay`).', ['conflict', 'replay']),
    ...rateLimited,
    ...internal,
    ...passkeysOff,
  },
})

export const passkeyListDocs = describeRoute({
  tags: ['Passkeys'],
  summary: 'List your passkeys',
  description: `The token’s account’s passkeys, newest first, and its user handle once it has one (Settings → Account shows its \`WitnessWork <tag>\`).

${readTier}`,
  security: bearerOnly,
  responses: {
    200: jsonResponse(
      'The passkeys.',
      z.object({
        ok: z.literal(true),
        userHandle: b64u('The account’s user handle; absent until it has one').optional(),
        passkeys: z.array(
          z.object({
            credentialId,
            canUnlock: z.boolean().meta({ description: 'Whether it has a wrap for the current key epoch.' }),
            createdAt: epochMs('When it was added'),
            lastUsedAt: epochMs('Its last verified assertion').optional(),
            createdPlatform: z.enum(PASSKEY_PLATFORMS),
            label: b64u('The sealed label the creating device sent').optional(),
            aaguid: z.string().optional().meta({ description: 'For a provider name; display only.' }),
            backedUp: z.boolean().meta({ description: 'The latest BS flag.' }),
          })
        ),
      })
    ),
    ...unauthorized,
    ...rateLimited,
    ...internal,
    ...passkeysOff,
  },
})

export const passkeyRemoveDocs = describeRoute({
  tags: ['Passkeys'],
  summary: 'Remove a passkey',
  description: `Bearer **and** signed (op \`passkey/remove\`). ${stepUpRequired} Deletes the credential and its wraps; idempotent (another account’s credential, or none, is \`ok\` and changes nothing). Logs \`passkey.removed\`. The passkey also has to be deleted from the password manager.

${readTier}`,
  security: bearerOnly,
  requestBody: signedWith('passkey/remove', { credentialId }),
  responses: {
    200: okOnly,
    ...signedErrors,
    403: errorResponse('The envelope is another account’s, or the web session needs a step-up.', ['forbidden', 'step_up_required']),
    404: errorResponse('No account has the envelope’s key.', ['unknown_account']),
    409: errorResponse('This envelope was already used; sign a new one.', ['replay']),
    ...rateLimited,
    ...internal,
    ...passkeysOff,
  },
})
