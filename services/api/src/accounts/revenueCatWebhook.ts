import type { AppContext } from '../types'
import { timingSafeEqual } from '../crypto'
import { RevenueCatError } from '../revenuecat'
import { readEnvelopeText } from '../buddies/envelope'
import { buddiesErrorResponse } from '../buddies/errorResponse'
import { parseJsonOrNull } from './auth'
import { guarded } from './signed'
import { accountsDb } from './store'
import {
  REVENUECAT_APP_USER_ID,
  defaultSupporterDependencies,
  linkedCustomerIds,
  recordWebhookEvent,
  refreshCustomer,
  webhookEventSeen,
  type SupporterDependencies,
} from './supporter'

/**
 * `POST /revenuecat/v1/webhook`: RevenueCat's webhook (witness-work ADR 0029
 * §3). Called by RevenueCat's servers only.
 *
 * - Authenticated by the Authorization header set on the integration,
 *   compared whole with `Bearer <REVENUECAT_WEBHOOK_AUTHORIZATION>` in
 *   constant time (401 otherwise; 503 `disabled` when the secret isn't set).
 * - The body is read only for the event's `id` and the customers it names;
 *   each one some account links is read again from RevenueCat's REST API,
 *   which is the authority (order and event type don't matter). Customers
 *   nobody linked are ignored and never stored.
 * - Idempotent by event id: recorded once every read is stored, and a repeat
 *   is answered 200 at once.
 * - RevenueCat unreachable is 503 `unavailable`, and RevenueCat retries (five
 *   times over about 80 minutes).
 *
 * Privacy: never logs or reports the body, an app user id, or the header.
 * Sentry drops `Authorization` from every event.
 */

/** RevenueCat event fields that name customers (`TRANSFER` uses the last two). */
const ID_FIELDS = ['app_user_id', 'original_app_user_id'] as const
const ID_LIST_FIELDS = [
  'aliases',
  'transferred_from',
  'transferred_to',
] as const

/** More than any real event names; bounds the reads one call can cause. */
const MAX_CUSTOMERS_PER_EVENT = 50

interface ParsedEvent {
  id: string
  type: string | null
  appUserIds: string[]
}

/** The event's id, type, and the linkable customer ids it names; null if malformed. */
export const parseWebhookEvent = (body: unknown): ParsedEvent | null => {
  if (!body || typeof body !== 'object') return null
  const event = (body as { event?: unknown }).event
  if (!event || typeof event !== 'object') return null
  const record = event as Record<string, unknown>
  if (typeof record.id !== 'string' || !record.id || record.id.length > 128)
    return null
  const ids = new Set<string>()
  const add = (value: unknown) => {
    // Anonymous ids (`$RCAnonymousID:…`) can't be linked, so never match.
    if (typeof value === 'string' && REVENUECAT_APP_USER_ID.test(value))
      ids.add(value)
  }
  for (const field of ID_FIELDS) add(record[field])
  for (const field of ID_LIST_FIELDS) {
    const list = record[field]
    if (Array.isArray(list)) list.forEach(add)
  }
  return {
    id: record.id,
    type: typeof record.type === 'string' ? record.type.slice(0, 64) : null,
    appUserIds: [...ids].slice(0, MAX_CUSTOMERS_PER_EVENT),
  }
}

export const createRevenueCatWebhookHandler = (
  overrides: Partial<SupporterDependencies> = {}
) =>
  guarded('revenuecat-webhook', async (c: AppContext) => {
    const secret = c.env.REVENUECAT_WEBHOOK_AUTHORIZATION
    const d1 = c.env.ACCOUNTS_DB
    if (!secret || !d1) return buddiesErrorResponse('disabled')
    if (
      !timingSafeEqual(c.req.header('authorization') ?? '', `Bearer ${secret}`)
    )
      return buddiesErrorResponse('unauthorized')

    const event = parseWebhookEvent(
      parseJsonOrNull(await readEnvelopeText(c.req.raw))
    )
    if (!event) return buddiesErrorResponse('bad_request')

    const db = accountsDb(d1)
    if (await webhookEventSeen(db, event.id))
      return c.json({ ok: true, customers: 0, duplicate: true })

    const linked = await linkedCustomerIds(db, event.appUserIds)
    // Together, so the deliveries' time is one read's deadline, not the sum.
    const reads = await Promise.allSettled(
      linked.map((appUserId) =>
        refreshCustomer(c.env, db, appUserId, overrides)
      )
    )
    const failures = reads.flatMap((read) =>
      read.status === 'rejected' ? [read.reason as unknown] : []
    )
    const unexpected = failures.find(
      (error) => !(error instanceof RevenueCatError)
    )
    if (unexpected) throw unexpected
    if (failures.length) {
      console.warn('revenuecat webhook: RevenueCat unreachable', {
        type: event.type,
      })
      return buddiesErrorResponse('unavailable')
    }
    const now = (overrides.now ?? defaultSupporterDependencies.now)()
    await recordWebhookEvent(db, event.id, now)
    console.log('revenuecat webhook', {
      type: event.type,
      customers: linked.length,
    })
    return c.json({ ok: true, customers: linked.length })
  })

export const handleRevenueCatWebhook = createRevenueCatWebhookHandler()
