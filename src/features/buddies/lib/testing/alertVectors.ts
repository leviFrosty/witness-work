import { fromB64u, toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { seal, sha256 } from '@/features/buddies/lib/crypto'
import {
  aad,
  deriveDirection,
  deriveIdentity,
  deriveInvite,
  derivePairSecret,
} from '@/features/buddies/lib/keys'
import {
  describeBuddyEvent,
  type BuddyAlertContext,
  type BuddyAlertOutcome,
  type SealedEvent,
} from '@/features/buddies/lib/pushAlerts'
import { buddyAlertText } from '@/features/buddies/lib/pushAlertText'
import { ANNOUNCE_ORDER } from '@/lib/badges/catalog'
import { ONE_TIME_BADGE_IDS } from '@/types/badges'

/**
 * Known-answer vectors for named alerts: a fixed context and sealed events of
 * every kind, with what `describeBuddyEvent` makes of each and the English
 * alert `buddyAlertText` words from it. `alertVectors.json` holds them; vitest
 * checks the TypeScript against it, and `scripts/tests/buddies-alerts.swift`
 * checks the Notification Service Extension's Swift against the same file, so
 * an alert reads the same on iOS and Android.
 */

/** 0, 1, 2, … as bytes, from `start`. */
const counting = (length: number, start = 0): Uint8Array =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff)

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

export type AlertVectorCase = {
  name: string
  event: SealedEvent
  /** Changes to the shared context for this case only. */
  context?: Partial<BuddyAlertContext>
  outcome: BuddyAlertOutcome
  /** The English alert, for outcomes that alert. */
  text?: { title: string; body?: string }
}

export type AlertVectors = {
  context: BuddyAlertContext
  /** How the extension formats days and times for these texts. */
  display: {
    language: string
    locale: string
    dayFirst: boolean
    clock24: boolean
  }
  cases: AlertVectorCase[]
}

export function computeAlertVectors(): AlertVectors {
  const me = deriveIdentity(counting(32, 0x00))
  const zoe = deriveIdentity(counting(32, 0x20))
  const sam = deriveIdentity(counting(32, 0x40))
  const direction = (them: typeof zoe, secret: Uint8Array) =>
    deriveDirection(
      derivePairSecret(
        me.dhPrivate,
        fromB64u(them.dhPub),
        secret,
        me.inboxId,
        them.inboxId
      ),
      me.inboxId
    )
  const fromZoe = direction(zoe, counting(16, 0xa0))
  const fromSam = direction(sam, counting(16, 0xb0))
  const invite = deriveInvite(counting(16, 0xc0))

  const zoePlan = toB64u(counting(16, 0x10))
  const myPlan = toB64u(counting(16, 0x30))
  const myFollowUp = toB64u(counting(16, 0x50))

  const context: BuddyAlertContext = {
    v: 1,
    inboxId: me.inboxId,
    ownerSeed: toB64u(me.ownerSeed),
    // Sam first, so finding Zoë's events means trying Sam's key and moving on.
    buddies: [
      {
        slot: fromSam.slotId,
        key: toB64u(fromSam.contentKey),
        name: 'Sam',
        joinMuted: true,
      },
      {
        slot: fromZoe.slotId,
        key: toB64u(fromZoe.contentKey),
        name: 'Zoë 王',
        shares: { [zoePlan]: { t: 'plan', d: '2026-10-10', s: 600 } },
      },
    ],
    invites: [{ id: invite.inviteId, key: toB64u(invite.inviteKey) }],
    myShares: {
      [myPlan]: { t: 'plan', d: '2026-10-11', s: 540 },
      [myFollowUp]: { t: 'followUp', d: '2026-10-12' },
    },
    badgeAlerts: true,
    joinAlerts: true,
    catalog: { order: [...ANNOUNCE_ORDER], oneTime: [...ONE_TIME_BADGE_IDS] },
  }

  let nonce = 0
  const eventId = (n: number) => toB64u(counting(16, 0x80 + n))
  /** `body` sealed by `from`, as the relay stores it. */
  const event = (
    n: number,
    kind: string,
    body: unknown,
    from = fromZoe
  ): SealedEvent => {
    const id = eventId(n)
    return {
      eventId: id,
      kind,
      blob: seal(
        from.contentKey,
        utf8(typeof body === 'string' ? body : JSON.stringify(body)),
        aad.event(me.inboxId, from.slotId, id),
        counting(12, nonce++)
      ),
    }
  }
  const joinKind = (slotId: string) =>
    `join.request.${toHex(sha256(utf8(`ww-buddies/v1/join-kind|${slotId}`)).slice(0, 6))}`

  const claim: SealedEvent = {
    eventId: invite.inviteId,
    kind: 'invite.claimed',
    blob: seal(
      invite.inviteKey,
      utf8(
        JSON.stringify({
          v: 1,
          name: 'Joe',
          dhPub: zoe.dhPub,
          inboxId: zoe.inboxId,
          offer: { plans: 'daysTimes' },
        })
      ),
      aad.claim(invite.inviteId),
      counting(12, 0xf0)
    ),
  }
  const details = {
    d: '2026-10-10',
    s: 600,
    m: 90,
    title: 'Cart at the station',
    location: { name: 'Main St', address: '1 Main St' },
    note: 'Bring the cart',
  }
  const followUp = {
    d: '2026-10-09',
    s: 930,
    firstName: 'Margarita',
    topic: 'Hope for the dead',
    location: { address: '22 Elm St', latitude: 1, longitude: 2 },
  }
  const share = (type: 'plan' | 'followUp', d: object, id = zoePlan) => ({
    v: 1,
    id,
    rev: 1,
    type,
    expiresAt: 1_900_000_000_000,
    details: d,
  })

  const tampered = event(30, 'plan.invite', share('plan', details))
  const bytes = fromB64u(tampered.blob)
  bytes[bytes.length - 1] ^= 1

  const specs: Omit<AlertVectorCase, 'outcome' | 'text'>[] = [
    { name: 'claim', event: claim },
    {
      name: 'claim for an invite this device has no key for',
      event: claim,
      context: { invites: [] },
    },
    {
      name: 'pairing confirmed',
      event: event(1, 'pair.confirmed', { v: 1, name: 'Zoë' }),
    },
    {
      name: 'Plan invitation',
      event: event(2, 'plan.invite', share('plan', details)),
    },
    {
      name: 'Follow-up invitation',
      event: event(3, 'followup.invite', share('followUp', followUp)),
    },
    {
      name: 'Plan changed, now without a start',
      event: event(4, 'plan.update', share('plan', { d: '2026-10-17', m: 60 })),
    },
    {
      name: 'Plan canceled',
      event: event(5, 'plan.cancel', { v: 1, id: zoePlan, rev: 2 }),
    },
    {
      name: 'Follow-up canceled, not known here',
      event: event(6, 'followup.cancel', {
        v: 1,
        id: toB64u(counting(16, 0x70)),
        rev: 2,
      }),
    },
    {
      name: 'going to your Plan',
      event: event(7, 'share.reply', {
        v: 1,
        id: myPlan,
        rev: 3,
        status: 'going',
      }),
    },
    {
      name: "can't make your Follow-up",
      event: event(8, 'share.reply', {
        v: 1,
        id: myFollowUp,
        rev: 3,
        status: 'declined',
      }),
    },
    {
      name: 'reply to a share not known here',
      event: event(9, 'share.reply', {
        v: 1,
        id: toB64u(counting(16, 0x90)),
        rev: 3,
        status: 'going',
      }),
    },
    {
      name: 'asks to join',
      event: event(10, joinKind(fromZoe.slotId), {
        v: 1,
        id: toB64u(counting(16, 0xa0)),
        rev: 1,
        d: '2026-10-11',
        s: 540,
        m: 120,
        expiresAt: 1_900_000_000_000,
      }),
    },
    {
      name: 'asks to join, muted here',
      event: event(
        11,
        joinKind(fromSam.slotId),
        {
          v: 1,
          id: toB64u(counting(16, 0xa1)),
          rev: 1,
          d: '2026-10-11',
          expiresAt: 1_900_000_000_000,
        },
        fromSam
      ),
    },
    {
      name: 'asks to join, with Ask to Join alerts off',
      event: event(12, joinKind(fromZoe.slotId), {
        v: 1,
        id: toB64u(counting(16, 0xa2)),
        rev: 1,
        d: '2026-10-11',
        expiresAt: 1_900_000_000_000,
      }),
      context: { joinAlerts: false },
    },
    {
      name: 'withdraws a request',
      event: event(13, 'join.cancel', {
        v: 1,
        id: toB64u(counting(16, 0xa0)),
        rev: 2,
      }),
    },
    {
      name: 'one new badge',
      event: event(14, 'badge.new', {
        v: 1,
        badges: [{ c: 'yearRound', l: 2 }],
      }),
    },
    {
      name: 'new badges, named in announcement order, skipping unknown ones',
      event: event(15, 'badge.new', {
        v: 1,
        badges: [
          { c: 'monthsShared', l: 1 },
          { c: 'futureBadge', l: 1 },
          { c: 'firstBibleStudy' },
          { c: 'returnVisits', l: 3 },
          { c: 'yearRound', l: 9 },
        ],
      }),
    },
    {
      name: 'only badges this build does not know',
      event: event(16, 'badge.new', {
        v: 1,
        badges: [{ c: 'futureBadge', l: 1 }],
      }),
    },
    {
      name: 'new badge with Badge Alerts off',
      event: event(17, 'badge.new', {
        v: 1,
        badges: [{ c: 'yearRound', l: 2 }],
      }),
      context: { badgeAlerts: false },
    },
    {
      name: 'reaction',
      event: event(18, 'badge.reaction', {
        v: 1,
        badge: { c: 'firstBuddy' },
        e: 'raisedHands',
        rev: 5,
      }),
    },
    {
      name: 'Plan invitation fetched from the inbox, from Sam',
      event: {
        ...event(19, 'plan.invite', share('plan', details), fromSam),
        slotId: fromSam.slotId,
      },
    },
    {
      name: 'fetched with a slot that is not the sender',
      event: {
        ...event(20, 'plan.invite', share('plan', details)),
        slotId: fromSam.slotId,
      },
    },
    { name: 'tampered', event: { ...tampered, blob: toB64u(bytes) } },
    {
      name: 'a kind this build does not word',
      event: event(21, 'plan.joined', { v: 1 }),
    },
    {
      name: 'malformed plaintext',
      event: event(22, 'plan.invite', { v: 2, id: zoePlan }),
    },
    { name: 'not JSON', event: event(23, 'badge.new', 'not json') },
  ]

  return {
    context,
    display: {
      language: 'en',
      locale: 'en-US',
      dayFirst: false,
      clock24: false,
    },
    cases: specs.map((spec) => {
      const outcome = describeBuddyEvent(
        { ...context, ...spec.context },
        spec.event
      )
      return {
        ...spec,
        outcome,
        ...('alert' in outcome ? { text: buddyAlertText(outcome.alert) } : {}),
      }
    }),
  }
}
