import type { AppContext, Environment } from '../types'
import { captureFailure } from '../sentry'
import { isPlainObject } from '../buddies/contracts'
import {
  isEnvelopeBody,
  parseEnvelope,
  readEnvelopeText,
} from '../buddies/envelope'
import { buddiesErrorResponse } from '../buddies/errorResponse'
import {
  ACCOUNT_LIMITS,
  type AccountFields,
  handoffBlobTooLarge,
  parseHandoffClaimRequest,
  parseHandoffTokenRequest,
} from './contracts'
import { hasAuthorization, parseJsonOrNull, readPlainJson } from './auth'
import {
  accountCall,
  guarded,
  plainFields,
  quotaName,
  refuseAtEdge,
  refuseOverDailyQuota,
  replyWith,
  verifyEnvelope,
} from './signed'
import { recordActivity } from './activity'
import { accountsDb } from './store'

/**
 * Set Up Another Device (witness-work `docs/accounts-protocol.md`, "Handoff"):
 * the old phone opens a channel and the new phone claims it with the token
 * from the QR code; the server relays a sealed hello one way and the sealed
 * account key the other, through one `AccountHandoff` Durable Object per
 * channel. Old-phone ops are bearer requests with plain JSON fields (or,
 * while the legacy switch is on, envelopes signed by the account key of a
 * registered account); new-phone ops are plain JSON authorized by
 * `claimToken`, with or without a session.
 *
 * `handoff/open` counts against the register edge tier and 20 opens per
 * account a rolling day; every other op against the read tier.
 *
 * `handoff/send` goes in the account's activity (`handoff.sent`, ADR 0028)
 * once the channel accepted the key.
 *
 * Privacy: nothing here logs or reports bodies, keys, tokens, account ids, or
 * channel ids.
 */

type OldPhoneOp = 'handoff/open' | 'handoff/status' | 'handoff/send' | 'handoff/cancel'

const channel = (env: Environment, channelId: string) =>
  env.ACCOUNT_HANDOFF.get(env.ACCOUNT_HANDOFF.idFromName(channelId))

/** Accounts off (no database) answers `disabled` before anything else. */
const precheck = async (
  c: AppContext,
  tier: 'inbox/register' | 'inbox/sync'
): Promise<Response | null> => {
  if (!c.env.ACCOUNTS_DB) return buddiesErrorResponse('disabled')
  return refuseAtEdge(c, tier)
}

/**
 * The old phone's account and fields for `op`, from the token and the JSON
 * body `text`, or from the envelope `text` holds (legacy). `open` and `send`,
 * which move the account, also need the token's session to be live
 * (`requireLiveSession`): a device that was signed out signs in again first.
 */
const oldPhone = <K extends OldPhoneOp>(
  c: AppContext,
  op: K,
  text: string | null,
  run: (accountId: string, fields: AccountFields<K>) => Promise<Response>
): Promise<Response> =>
  accountCall(
    c,
    {
      bearer: async () => {
        const body = parseJsonOrNull(text)
        if (handoffBlobTooLarge(body))
          return { refusal: buddiesErrorResponse('too_large') }
        return plainFields(op, body)
      },
      legacy: () =>
        verifyEnvelope(op, text == null ? null : parseEnvelope(text)),
    },
    run,
    { requireLiveSession: op === 'handoff/open' || op === 'handoff/send' }
  )

const handleOpen = guarded('handoff/open', async (c) => {
  const refused = await precheck(c, 'inbox/register')
  if (refused) return refused
  const text = await readEnvelopeText(c.req.raw)
  return oldPhone(c, 'handoff/open', text, async (accountId, fields) => {
    const overQuota = await refuseOverDailyQuota(
      c.env,
      await quotaName('handoff-open', accountId),
      ACCOUNT_LIMITS.handoffOpensPerDay,
      'handoff/open',
      'handoffOpensPerDay'
    )
    if (overQuota) return overQuota
    const { channelId, verifier } = fields
    return replyWith(
      c,
      await channel(c.env, channelId).open({ channelId, accountId, verifier })
    )
  })
})

const handleStatus = guarded('handoff/status', async (c) => {
  const refused = await precheck(c, 'inbox/sync')
  if (refused) return refused
  const text = await readEnvelopeText(c.req.raw)
  return oldPhone(c, 'handoff/status', text, async (accountId, { channelId }) =>
    replyWith(c, await channel(c.env, channelId).status(channelId, accountId))
  )
})

const handleSend = guarded('handoff/send', async (c) => {
  const refused = await precheck(c, 'inbox/sync')
  if (refused) return refused
  const text = await readEnvelopeText(c.req.raw)
  return oldPhone(c, 'handoff/send', text, async (accountId, fields) => {
    const result = await channel(c.env, fields.channelId).send(
      fields.channelId,
      accountId,
      fields.key
    )
    // The key has left: a failed entry is reported, never the send's answer.
    if (result.ok)
      await recordActivity(accountsDb(c.env.ACCOUNTS_DB!), {
        accountId,
        kind: 'handoff.sent',
        sessionId: c.get('account')?.sessionId ?? null,
      }).catch((error: unknown) => {
        console.error('accounts: activity write failed', { op: 'handoff/send' })
        captureFailure(error, 'handoff/send')
      })
    return replyWith(c, result)
  })
})

const handleClaim = guarded('handoff/claim', async (c) => {
  const refused = await precheck(c, 'inbox/sync')
  if (refused) return refused
  const body = await readPlainJson(c)
  if (handoffBlobTooLarge(body)) return buddiesErrorResponse('too_large')
  const request = parseHandoffClaimRequest(body)
  if (!request) return buddiesErrorResponse('bad_request')
  return replyWith(c, await channel(c.env, request.channelId).claim(request))
})

const handleReceive = guarded('handoff/receive', async (c) => {
  const refused = await precheck(c, 'inbox/sync')
  if (refused) return refused
  const request = parseHandoffTokenRequest(await readPlainJson(c))
  if (!request) return buddiesErrorResponse('bad_request')
  return replyWith(c, await channel(c.env, request.channelId).receive(request))
})

const handleDone = guarded('handoff/done', async (c) => {
  const refused = await precheck(c, 'inbox/sync')
  if (refused) return refused
  const request = parseHandoffTokenRequest(await readPlainJson(c))
  if (!request) return buddiesErrorResponse('bad_request')
  return replyWith(c, await channel(c.env, request.channelId).done(request))
})

/**
 * Either phone. A body with `claimToken` (and no envelope `payload`) is the new
 * phone's; otherwise a bearer request, or a signed envelope (legacy), is the
 * old phone's. Anything else must be the new phone's `channelId` and
 * `claimToken`.
 */
const handleCancel = guarded('handoff/cancel', async (c) => {
  const refused = await precheck(c, 'inbox/sync')
  if (refused) return refused
  const text = await readEnvelopeText(c.req.raw)
  const body = parseJsonOrNull(text)
  const signed = isPlainObject(body) && isEnvelopeBody(body)
  const newPhone = isPlainObject(body) && 'claimToken' in body && !signed
  if (!newPhone && (signed || hasAuthorization(c)))
    return oldPhone(c, 'handoff/cancel', text, async (accountId, { channelId }) =>
      replyWith(
        c,
        await channel(c.env, channelId).cancelByAccount(channelId, accountId)
      )
    )
  const request = parseHandoffTokenRequest(body)
  if (!request) return buddiesErrorResponse('bad_request')
  return replyWith(
    c,
    await channel(c.env, request.channelId).cancelByToken(request)
  )
})

export const handoffHandlers = {
  open: handleOpen,
  claim: handleClaim,
  status: handleStatus,
  send: handleSend,
  receive: handleReceive,
  done: handleDone,
  cancel: handleCancel,
}
