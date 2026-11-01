import { describe, expect, it, vi } from 'vitest'
import { fromB64u, fromUtf8, toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { open, seal, sha256 } from '@/features/buddies/lib/crypto'
import {
  deriveDirection,
  deriveIdentity,
  deriveInvite,
  derivePairSecret,
} from '@/features/buddies/lib/keys'
import {
  buildInviteLink,
  parseInviteSecret,
} from '@/features/buddies/lib/inviteLink'
import { buildBuddyCardDays } from '@/features/buddies/lib/card'
import { RelayError } from '@/features/buddies/lib/relay'
import {
  BADGE_PUSH_KIND,
  BADGE_REACTION_PUSH_KIND,
  BUDDY_PUSH_KINDS,
  BuddyInviteError,
  BuddyRemovalPendingError,
  PUSH_REGISTRATION_REFRESH_MS,
} from '@/features/buddies/lib/engine'
import {
  badgeReactionsFrom,
  BuddiesState,
  Buddy,
  BuddyNotification,
  BuddySharing,
  IncomingShare,
  incomingShareKey,
  listedNotifications,
  mergeSharing,
  migrateLegacySettings,
  INVITE_TTL_MS,
  MAX_ANSWER_MARKS,
  MAX_NOTIFICATION_MARKS,
  MAX_NOTIFICATIONS,
  MAX_REMOVED_BUDDIES,
  mergeAnswerMarks,
  mergeNotificationMarks,
  mergeRemovedBuddies,
  OutgoingShareSpec,
  REPLY_HOLD_MS,
  replyHoldMs,
} from '@/features/buddies/lib/state'
import {
  buildOutgoingShares,
  followUpShareDetails,
  planShareKey,
  shareEndsAt,
  shareRecipientsKey,
} from '@/features/buddies/lib/shares'
import { guestTag, whosGoing } from '@/features/buddies/lib/guests'
import {
  effectiveShareStatus,
  forgetBuddiesInData,
  linkedPlanId,
  reconcileLinkedPlans,
  sharesJustAccepted,
  sharesLeftUnlinked,
} from '@/features/buddies/lib/linkedPlans'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import {
  BADGE_REACTION_EMOJI,
  BADGE_REACTION_IDS,
  type BadgeReactionEmoji,
  isBadgeReactionEmoji,
} from '@/features/buddies/lib/badgeReactions'
import {
  badgeReactionSchema,
  rosterSchema,
} from '@/features/buddies/lib/schemas'
import type {
  BuddyStreak,
  Roster,
  ShareReply,
} from '@/features/buddies/lib/schemas'
import {
  ownerAuthFor,
  pair,
  type Plans,
  random,
  setup,
} from '@/features/buddies/lib/testing/engineHarness'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import { RecurringPlanFrequencies } from '@/lib/recurrence'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const dayPlan = (date: string, minutes: number, start?: number): DayPlan => ({
  id: `day-${date}`,
  date: normalizeDateForStorage(date),
  minutes,
  ...(start === undefined ? {} : { startTimeInMinutes: start }),
})

const weeklyPlan = (startDate: string, minutes: number): RecurringPlan => ({
  id: 'weekly',
  startDate: normalizeDateForStorage(startDate),
  minutes,
  recurrence: {
    frequency: RecurringPlanFrequencies.WEEKLY,
    interval: 1,
    endDate: null,
  },
})

describe('buddies primitives', () => {
  it('round-trips base64url at every padding length', () => {
    for (let length = 0; length < 40; length++) {
      const bytes = random(length)
      expect(fromB64u(toB64u(bytes))).toEqual(bytes)
    }
    expect(() => fromB64u('ab+c')).toThrow()
  })

  it('derives the same pair secret from both sides and distinct directions', () => {
    const alice = deriveIdentity(random(32))
    const bob = deriveIdentity(random(32))
    const secret = random(16)
    const fromAlice = derivePairSecret(
      alice.dhPrivate,
      fromB64u(bob.dhPub),
      secret,
      alice.inboxId,
      bob.inboxId
    )
    const fromBob = derivePairSecret(
      bob.dhPrivate,
      fromB64u(alice.dhPub),
      secret,
      bob.inboxId,
      alice.inboxId
    )
    expect(fromAlice).toEqual(fromBob)
    const toAlice = deriveDirection(fromAlice, alice.inboxId)
    const toBob = deriveDirection(fromAlice, bob.inboxId)
    expect(toAlice.slotId).not.toBe(toBob.slotId)
    expect(toAlice.contentKey).not.toEqual(toBob.contentKey)
    expect(toAlice.slotId).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('rejects sealed blobs opened with the wrong context or tampered', () => {
    const key = random(32)
    const blob = seal(key, utf8('hello'), 'ctx|a', random(12))
    expect(open(key, blob, 'ctx|a')).toEqual(utf8('hello'))
    expect(() => open(key, blob, 'ctx|b')).toThrow()
    const bytes = fromB64u(blob)
    bytes[bytes.length - 1] ^= 1
    expect(() => open(key, toB64u(bytes), 'ctx|a')).toThrow()
  })

  it('keeps the invite secret in the fragment and finds links in pasted text', () => {
    const secret = random(16)
    const link = buildInviteLink(secret)
    expect(link).toMatch(/^https:\/\/ww-proxy\.leviwilkerson\.com\/b#1/)
    expect(new URL(link).pathname).toBe('/b')
    expect(parseInviteSecret(`Join me! ${link} see you`)).toEqual(secret)
    expect(parseInviteSecret('https://evil.example/b#1' + toB64u(secret))).toBe(
      null
    )
    expect(parseInviteSecret(link + 'x')).toBe(null)
    expect(deriveInvite(secret).inviteId).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })
})

describe('shareRecipientsKey', () => {
  const plan = (buddies?: string[]): DayPlan => ({
    ...dayPlan('2026-09-24', 60, 600),
    ...(buddies ? { buddies } : {}),
  })

  it('changes with who is invited, not with details or order', () => {
    const base = shareRecipientsKey([plan(['a', 'b'])], [])
    expect(shareRecipientsKey([plan(['b', 'a'])], [])).toBe(base)
    expect(shareRecipientsKey([{ ...plan(['a', 'b']), minutes: 90 }], [])).toBe(
      base
    )

    expect(shareRecipientsKey([plan(['a', 'b', 'c'])], [])).not.toBe(base)
    expect(shareRecipientsKey([plan(['a'])], [])).not.toBe(base)
    expect(shareRecipientsKey([], [])).not.toBe(base)
  })

  it("ignores Plans that follow a buddy's invitation", () => {
    const linked: DayPlan = {
      ...plan(['a']),
      buddyShare: { from: 'x', shareId: 'y' },
    }
    expect(shareRecipientsKey([linked], [])).toBe('')
  })
})

describe('buildBuddyCardDays', () => {
  const today = new Date(2026, 8, 23, 11)

  it('shares only start times and minutes from today forward', () => {
    const days = buildBuddyCardDays(
      [dayPlan('2026-09-22', 60), dayPlan('2026-09-25', 120, 540)],
      [],
      today
    )
    expect(days).toEqual([{ d: '2026-09-25', p: [{ s: 540, m: 120 }] }])
  })

  it('shares a Day Plan beside the recurring instance on its day', () => {
    const days = buildBuddyCardDays(
      [dayPlan('2026-09-30', 90)],
      [weeklyPlan('2026-09-23', 180)],
      today,
      15
    )
    expect(days.map((day) => day.d)).toEqual([
      '2026-09-23',
      '2026-09-30',
      '2026-10-07',
    ])
    expect(days[1].p).toEqual([{ m: 90 }, { m: 180 }])
    expect(days[0].p).toEqual([{ m: 180 }])
  })
})

describe('buddies relay client', () => {
  it("refuses another account's session on an inbox", async () => {
    const { user } = setup()
    const mom = user('Mom')
    const impostor = user('Impostor')
    await mom.engine.sync()

    await expect(
      impostor.relay.syncInbox(ownerAuthFor(mom.seed), 0)
    ).rejects.toEqual(new RelayError('forbidden', 403))
  })

  it('probes the inbox for the relay check without applying anything', async () => {
    const { user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    const before = anna.store.getState()

    mom.profile.name = 'Mother'
    await mom.engine.publishCards()
    const probe = await anna.engine.probeInbox()

    expect(probe).toMatchObject({ since: before.syncSeq, slots: 1, cards: 1 })
    expect(probe.seq).toBeGreaterThan(before.syncSeq)
    expect(anna.store.getState().syncSeq).toBe(before.syncSeq)
    expect(anna.store.getState().buddies[0].name).toBe('Mom')
  })
})

describe('buddies pairing', () => {
  it('tells each side the other’s platform when pairing completes, for analytics', async () => {
    const { user } = setup()
    const onIphone = vi.fn()
    const onPixel = vi.fn()
    const iphone = user('Mom', undefined, undefined, {
      platform: 'ios',
      onPaired: onIphone,
    })
    const pixel = user('Anna', undefined, undefined, {
      platform: 'android',
      onPaired: onPixel,
    })

    const link = await iphone.engine.createInvite()
    await pixel.engine.acceptInvite(link)
    await iphone.engine.sync()
    expect(iphone.store.getState().incomingClaims[0].platform).toBe('android')
    expect(onIphone).not.toHaveBeenCalled()
    await iphone.engine.confirmClaim(
      iphone.store.getState().incomingClaims[0].inviteId
    )
    expect(onIphone).toHaveBeenCalledExactlyOnceWith({
      role: 'inviter',
      buddyPlatform: 'android',
    })
    await pixel.engine.sync()
    expect(onPixel).toHaveBeenCalledExactlyOnceWith({
      role: 'invitee',
      buddyPlatform: 'ios',
    })

    await pixel.engine.sync()
    await iphone.engine.sync()
    expect(onPixel).toHaveBeenCalledTimes(1)
    expect(onIphone).toHaveBeenCalledTimes(1)
  })

  it('pairs with builds that send no platform', async () => {
    const { user } = setup()
    const onPaired = vi.fn()
    const older = user('Mom')
    const pixel = user('Anna', undefined, undefined, {
      platform: 'android',
      onPaired,
    })

    await pair(older, pixel)

    expect(onPaired).toHaveBeenCalledExactlyOnceWith({
      role: 'invitee',
      buddyPlatform: undefined,
    })
    expect(older.store.getState().buddies[0].status).toBe('active')
    expect(pixel.store.getState().buddies[0].status).toBe('active')
  })

  it('pairs through invite, claim, and one-tap confirmation', async () => {
    const { fake, user } = setup()
    const mom = user('Mom', {
      dayPlans: [dayPlan('2026-09-26', 180, 540)],
      recurringPlans: [],
    })
    const anna = user('Anna', {
      dayPlans: [dayPlan('2026-09-27', 120)],
      recurringPlans: [],
    })

    const link = await mom.engine.createInvite()
    await expect(anna.engine.previewInvite(link)).resolves.toMatchObject({
      name: 'Mom',
    })
    await anna.engine.acceptInvite(link)
    expect(anna.store.getState().buddies[0]).toMatchObject({
      name: 'Mom',
      status: 'awaitingConfirm',
    })
    expect(fake.pushes).toContainEqual({
      inboxId: mom.inboxId,
      kind: 'invite.claimed',
    })

    await anna.engine.sync()
    expect(anna.store.getState().cards).toEqual({})

    await mom.engine.sync()
    const [claim] = mom.store.getState().incomingClaims
    expect(claim).toMatchObject({ name: 'Anna', inboxId: anna.inboxId })
    await mom.engine.confirmClaim(claim.inviteId)
    expect(fake.pushes).toContainEqual({
      inboxId: anna.inboxId,
      kind: 'pair.confirmed',
    })
    expect(mom.store.getState().outgoingInvites).toEqual([])
    expect(fake.invites.size).toBe(0)

    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].status).toBe('active')
    expect(anna.store.getState().cards[mom.inboxId].days).toEqual([
      { d: '2026-09-26', p: [{ s: 540, m: 180 }] },
    ])

    await mom.engine.sync()
    expect(mom.store.getState().cards[anna.inboxId].days).toEqual([
      { d: '2026-09-27', p: [{ m: 120 }] },
    ])
  })

  it('treats an invite as single-use and rejects your own link', async () => {
    const { user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    const stranger = user('Stranger')

    const link = await mom.engine.createInvite()
    await expect(mom.engine.previewInvite(link)).rejects.toEqual(
      new BuddyInviteError('own')
    )
    await anna.engine.acceptInvite(link)
    await expect(stranger.engine.acceptInvite(link)).rejects.toEqual(
      new BuddyInviteError('unavailable')
    )
  })

  it('republishes a card only when its content changes', async () => {
    const { fake, user } = setup()
    const plans: Plans = { dayPlans: [], recurringPlans: [] }
    const mom = user('Mom', plans)
    const anna = user('Anna')
    await pair(mom, anna)
    const cardSeq = () =>
      fake.inboxes.get(anna.inboxId)!.cards.values().next().value?.seq

    const before = cardSeq()
    await mom.engine.publishCards()
    expect(cardSeq()).toBe(before)

    plans.dayPlans = [dayPlan('2026-09-28', 60)]
    await mom.engine.publishCards()
    expect(cardSeq()).toBeGreaterThan(before!)
  })

  it('ends the connection for both people when either removes the other', async () => {
    const { fake, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    await anna.engine.removeBuddy(mom.inboxId)
    expect(anna.store.getState().buddies).toEqual([])
    const pushesBefore = fake.pushes.length

    await mom.engine.sync()
    expect(mom.store.getState().buddies).toEqual([])
    expect(mom.store.getState().cards).toEqual({})
    expect(fake.pushes.length).toBe(pushesBefore)
  })

  it('lets an unconfirmed request lapse when the inviter rejects it', async () => {
    const { advance, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')

    const link = await mom.engine.createInvite()
    await anna.engine.acceptInvite(link)
    await mom.engine.sync()
    await mom.engine.rejectClaim(
      mom.store.getState().incomingClaims[0].inviteId
    )
    expect(mom.store.getState().outgoingInvites).toEqual([])

    advance(INVITE_TTL_MS + 1)
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toEqual([])
  })

  it('syncs once more for a caller that asked while a sync was running', async () => {
    const { user, setAfterOp } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    let reached!: () => void
    let release!: () => void
    const atSync = new Promise<void>((resolve) => (reached = resolve))
    const held = new Promise<void>((resolve) => (release = resolve))
    setAfterOp(async (op) => {
      if (op !== 'inbox/sync') return
      setAfterOp(null)
      reached()
      await held
    })
    const first = anna.engine.sync()
    await atSync
    mom.profile.name = 'Mother'
    await mom.engine.publishCards()

    const second = anna.engine.sync()
    release()
    await Promise.all([first, second])

    expect(anna.store.getState().buddies[0].name).toBe('Mother')
  })

  it('shares name, photo, and Tenure, keeping photos out of small payloads', async () => {
    const { user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    const photo = 'A'.repeat(4000)
    Object.assign(mom.profile, {
      avatar: { t: 'image', v: photo },
      tenure: { kind: 'pioneer', since: '2019-09' },
    })
    Object.assign(anna.profile, { avatar: { t: 'emoji', v: '🌱' } })

    const link = await mom.engine.createInvite()

    expect(await anna.engine.previewInvite(link)).toMatchObject({
      name: 'Mom',
      avatar: undefined,
      tenure: { kind: 'pioneer', since: '2019-09' },
    })
    await anna.engine.acceptInvite(link)
    await mom.engine.sync()
    expect(mom.store.getState().incomingClaims[0]).toMatchObject({
      name: 'Anna',
      avatar: { t: 'emoji', v: '🌱' },
    })
    await mom.engine.confirmClaim(
      mom.store.getState().incomingClaims[0].inviteId
    )
    await anna.engine.sync()
    await anna.engine.publishCards()
    await mom.engine.sync()

    expect(anna.store.getState().buddies[0]).toMatchObject({
      name: 'Mom',
      avatar: { t: 'image', v: photo },
      tenure: { kind: 'pioneer', since: '2019-09' },
    })
    expect(mom.store.getState().buddies[0]).toMatchObject({
      name: 'Anna',
      avatar: { t: 'emoji', v: '🌱' },
    })

    mom.profile.name = 'Mother'
    await mom.engine.publishCards()
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].name).toBe('Mother')
    const annasIpad = user('Anna', undefined, anna.seed)
    await annasIpad.engine.sync()
    expect(annasIpad.store.getState().buddies[0]).toMatchObject({
      name: 'Mother',
      avatar: { t: 'image', v: photo },
    })
  })

  it('stops sharing a photo or Tenure once switched off', async () => {
    const { fake, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    Object.assign(mom.profile, {
      avatar: { t: 'emoji', v: '🌻' },
      tenure: { kind: 'pioneer', since: '2019-09' },
    })

    await mom.engine.setSharing({ tenure: false })
    expect(fake.inboxes.size).toBe(0)
    const link = await mom.engine.createInvite()
    expect(await anna.engine.previewInvite(link)).toMatchObject({
      avatar: { t: 'emoji', v: '🌻' },
      tenure: undefined,
    })
    await mom.engine.setSharing({ tenure: true })
    await anna.engine.acceptInvite(link)
    await mom.engine.sync()
    await mom.engine.confirmClaim(
      mom.store.getState().incomingClaims[0].inviteId
    )
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0]).toMatchObject({
      avatar: { t: 'emoji', v: '🌻' },
      tenure: { kind: 'pioneer', since: '2019-09' },
    })

    await mom.engine.setSharing({ photo: false, tenure: false })
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0]).toMatchObject({ name: 'Mom' })
    expect(anna.store.getState().buddies[0].avatar).toBeUndefined()
    expect(anna.store.getState().buddies[0].tenure).toBeUndefined()
  })

  it('keeps sharing choices the same on all of a User’s devices', async () => {
    const { advance, fake, user } = setup()
    const plans: Plans = { dayPlans: [], recurringPlans: [] }
    const mom = user('Mom')
    const anna = user('Anna')
    const tenure = { kind: 'pioneer', since: '2019-09' } as const
    mom.profile.tenure = tenure
    await pair(mom, anna)
    const momsIpad = user('Mom', plans, mom.seed)
    momsIpad.profile.tenure = tenure
    await momsIpad.engine.sync()

    advance(1000)
    await mom.engine.setSharing({ tenure: false })
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().sharing).toMatchObject({ tenure: false })

    plans.dayPlans = [dayPlan('2026-09-28', 60)]
    await momsIpad.engine.publishCards()
    await anna.engine.sync()
    expect(anna.store.getState().cards[mom.inboxId].days).toHaveLength(1)
    expect(anna.store.getState().buddies[0].tenure).toBeUndefined()

    advance(1000)
    await momsIpad.engine.setSharing({ tenure: true })

    await mom.engine.createInvite()
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().sharing.tenure).toBe(true)
    await mom.engine.sync()
    expect(mom.store.getState().sharing.tenure).toBe(true)
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].tenure).toEqual(tenure)
    expect(fake.inboxes.get(mom.inboxId)!.slots.size).toBe(1)
  })

  it('shares the streak in Buddy Cards until switched off', async () => {
    const { advance, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    mom.setStreak({ n: 5, until: '2026-10-04' })
    await pair(mom, anna)
    expect(anna.store.getState().buddies[0].streak).toEqual({
      n: 5,
      until: '2026-10-04',
    })

    mom.setStreak({ n: 6, until: '2026-10-11' })
    await mom.engine.publishCards()
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].streak?.n).toBe(6)
    mom.setStreak(undefined)
    await mom.engine.publishCards()
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].streak).toBeUndefined()

    mom.setStreak({ n: 7, until: '2026-10-18' })
    advance(1000)
    await mom.engine.setSharing({ streak: false })
    const momsIpad = user('Mom', undefined, mom.seed)
    momsIpad.setStreak({ n: 7, until: '2026-10-18' })
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().sharing.streak).toBe(false)
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].streak).toBeUndefined()

    const annasIpad = user('Anna', undefined, anna.seed)
    await mom.engine.setSharing({ streak: true })
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].streak?.n).toBe(7)
    await annasIpad.engine.sync()
    expect(annasIpad.store.getState().buddies[0].streak?.n).toBe(7)
  })

  it('shares Plan times as precisely as chosen, on every device', async () => {
    const { advance, user } = setup()
    const plans: Plans = {
      dayPlans: [
        dayPlan('2026-09-26', 120, 540),
        dayPlan('2026-09-27', 60, 1110),
        dayPlan('2026-09-28', 90),
      ],
      recurringPlans: [],
    }
    const mom = user('Mom', plans)
    const anna = user('Anna')
    await pair(mom, anna)
    const days = () => anna.store.getState().cards[mom.inboxId].days

    advance(1000)
    await mom.engine.setSharing({ planTimes: 'timeOfDay' })
    await anna.engine.sync()
    expect(days()).toEqual([
      { d: '2026-09-26', p: [{ m: 120, t: 'm' }] },
      { d: '2026-09-27', p: [{ m: 60, t: 'e' }] },
      { d: '2026-09-28', p: [{ m: 90 }] },
    ])

    advance(1000)
    await mom.engine.setSharing({ planTimes: 'daysOnly' })
    await anna.engine.sync()
    expect(days()).toEqual([
      { d: '2026-09-26', p: [{ m: 120 }] },
      { d: '2026-09-27', p: [{ m: 60 }] },
      { d: '2026-09-28', p: [{ m: 90 }] },
    ])

    const momsIpad = user('Mom', plans, mom.seed)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().sharing.planTimes).toBe('daysOnly')
    plans.dayPlans = [dayPlan('2026-09-29', 30, 800)]
    await momsIpad.engine.publishCards()
    await anna.engine.sync()
    expect(days()).toEqual([{ d: '2026-09-29', p: [{ m: 30 }] }])
  })

  it('gives a buddy their own settings over All Buddies’, on every device, and pauses everyone', async () => {
    const { advance, now, user } = setup()
    const plans: Plans = {
      dayPlans: [dayPlan('2026-10-20', 120, 540)],
      recurringPlans: [],
    }
    const mom = user('Mom', plans)
    const anna = user('Anna')
    const joe = user('Joe')
    mom.setStreak({ n: 5, until: '2026-10-25' })
    await pair(mom, anna)
    await pair(mom, joe)
    const sees = (buddy: typeof anna) => ({
      days: buddy.store.getState().cards[mom.inboxId].days.length,
      streak: buddy.store.getState().buddies[0].streak?.n,
      name: buddy.store.getState().buddies[0].name,
    })
    expect(sees(anna)).toEqual({ days: 1, streak: 5, name: 'Mom' })

    advance(1000)
    await mom.engine.setBuddySetting(anna.inboxId, 'plans', false)
    await anna.engine.sync()
    expect(sees(anna)).toEqual({ days: 0, streak: 5, name: 'Mom' })
    advance(1000)
    await mom.engine.setBuddySetting(anna.inboxId, 'streak', false)
    await anna.engine.sync()
    await joe.engine.sync()
    expect(sees(anna)).toEqual({ days: 0, streak: undefined, name: 'Mom' })
    expect(sees(joe)).toEqual({ days: 1, streak: 5, name: 'Mom' })

    const momsIpad = user('Mom', plans, mom.seed)
    momsIpad.setStreak({ n: 5, until: '2026-10-25' })
    await momsIpad.engine.sync()
    expect(
      momsIpad.store.getState().buddies.find((b) => b.inboxId === anna.inboxId)
        ?.overrides
    ).toEqual({ plans: false, streak: false })
    await momsIpad.engine.publishCards({ edited: true })
    await anna.engine.sync()
    expect(sees(anna).days).toBe(0)

    advance(1000)
    await mom.engine.setBuddySetting(anna.inboxId, 'badges', false)
    await mom.engine.announceBadges(['monthsShared.1'])
    expect(mom.store.getState().badgeAnnouncements[0].recipients).toEqual([
      joe.inboxId,
    ])

    advance(1000)
    await mom.engine.setBuddyOverrides(anna.inboxId, () => undefined)
    await mom.engine.setSharing({ plans: false })
    await mom.engine.setBuddySetting(joe.inboxId, 'plans', true)
    await anna.engine.sync()
    await joe.engine.sync()
    expect(sees(anna)).toEqual({ days: 0, streak: 5, name: 'Mom' })
    expect(sees(joe)).toEqual({ days: 1, streak: 5, name: 'Mom' })

    advance(1000)
    await mom.engine.setSharing({ pausedUntil: now() + 7 * 86_400_000 })
    await joe.engine.sync()
    expect(sees(joe)).toEqual({ days: 0, streak: undefined, name: 'Mom' })

    advance(8 * 86_400_000)
    mom.setStreak({ n: 6, until: '2026-11-01' })
    plans.dayPlans = [dayPlan('2026-10-31', 60, 600)]
    await mom.engine.publishCards()
    await joe.engine.sync()
    expect(sees(joe)).toEqual({ days: 1, streak: 6, name: 'Mom' })
  })

  it('reads a card whose streak it doesn’t understand', async () => {
    const { user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    mom.setStreak({ n: -1, until: 'soon' } as unknown as BuddyStreak)
    mom.profile.tenure = { kind: 'pioneer', since: '2019-09' }
    await pair(mom, anna)
    expect(anna.store.getState().buddies[0]).toMatchObject({
      name: 'Mom',
      tenure: { kind: 'pioneer', since: '2019-09' },
    })
    expect(anna.store.getState().buddies[0].streak).toBeUndefined()
  })

  it('caps active buddies plus pending invites at five', async () => {
    const { user } = setup()
    const mom = user('Mom')
    for (let index = 0; index < 3; index++) await mom.engine.createInvite()
    await expect(mom.engine.createInvite()).rejects.toThrow()
    expect(mom.store.getState().outgoingInvites).toHaveLength(3)
  })

  it('keeps an invite whose answer got lost, so Try Again shows it instead of a second one', async () => {
    const { fake, user, setAfterOp } = setup()
    const mom = user('Mom')

    setAfterOp(async (op) => {
      if (op !== 'invite/create') return
      setAfterOp(null)
      throw new TypeError('Network request failed')
    })
    await expect(mom.engine.createInvite()).rejects.toThrow()
    expect(fake.invites.size).toBe(1)

    const link = await mom.engine.createInvite()
    expect(fake.invites.size).toBe(1)
    const [invite] = mom.store.getState().outgoingInvites
    expect(mom.store.getState().outgoingInvites).toHaveLength(1)
    expect(mom.engine.inviteLinkFor(invite.inviteId)).toBe(link)
    expect(fake.invites.has(invite.inviteId)).toBe(true)

    await mom.engine.cancelInvite(invite.inviteId)
    for (let index = 0; index < 3; index++) await mom.engine.createInvite()
    expect(mom.store.getState().outgoingInvites).toHaveLength(3)
  })

  it('lists an invite whose answer got lost on the next sync', async () => {
    const { fake, user, setAfterOp } = setup()
    const mom = user('Mom')
    setAfterOp(async (op) => {
      if (op !== 'invite/create') return
      setAfterOp(null)
      throw new TypeError('Network request failed')
    })
    await expect(mom.engine.createInvite()).rejects.toThrow()
    await mom.engine.sync()
    const [created] = fake.invites.keys()
    expect(mom.store.getState().outgoingInvites).toMatchObject([
      { inviteId: created },
    ])
  })

  it('forgets an invite that never reached the relay', async () => {
    const { fake, offlineOps, user } = setup()
    const mom = user('Mom')
    await mom.engine.sync()
    offlineOps.add('invite/create')
    await expect(mom.engine.createInvite()).rejects.toThrow()
    offlineOps.clear()
    await mom.engine.sync()
    expect(mom.store.getState().outgoingInvites).toHaveLength(0)
    expect(mom.store.getState().unconfirmedInvites).toHaveLength(0)
    await mom.engine.createInvite()
    expect(fake.invites.size).toBe(1)
    expect(mom.store.getState().outgoingInvites).toHaveLength(1)
  })

  it('restores buddies on a second device from the encrypted roster', async () => {
    const { user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    const momsIpad = user('', { dayPlans: [], recurringPlans: [] }, mom.seed)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().buddies).toMatchObject([
      { inboxId: anna.inboxId, status: 'active' },
    ])
  })

  it('restores a nickname and color on a second device', async () => {
    const { user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    await mom.engine.setNickname(anna.inboxId, '  Annie  ')
    await mom.engine.setColor(anna.inboxId, '#A855F7')
    const momsIpad = user('', { dayPlans: [], recurringPlans: [] }, mom.seed)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().buddies).toMatchObject([
      { inboxId: anna.inboxId, nickname: 'Annie', color: '#A855F7' },
    ])

    await mom.engine.setNickname(anna.inboxId, ' ')
    expect(mom.store.getState().buddies[0].nickname).toBeUndefined()
    await mom.engine.setColor(anna.inboxId, null)
    expect(mom.store.getState().buddies[0].color).toBeUndefined()
  })

  it('keeps devices that already have buddies in step through the roster', async () => {
    const { fake, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    const joe = user('Joe', {
      dayPlans: [dayPlan('2026-09-29', 60)],
      recurringPlans: [],
    })
    const sue = user('Sue')
    await pair(mom, anna)
    const momsIpad = user('Mom', { dayPlans: [], recurringPlans: [] }, mom.seed)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().buddies).toHaveLength(1)

    await pair(mom, joe)
    await joe.engine.publishCards()
    await momsIpad.engine.sync()
    expect(
      momsIpad.store
        .getState()
        .buddies.map((b) => b.inboxId)
        .sort()
    ).toEqual([anna.inboxId, joe.inboxId].sort())
    expect(momsIpad.store.getState().cards[joe.inboxId].days).toEqual([
      { d: '2026-09-29', p: [{ m: 60 }] },
    ])

    await pair(mom, sue)
    await momsIpad.engine.createInvite()

    await mom.engine.sync()
    expect(mom.store.getState().outgoingInvites).toEqual([])
    await momsIpad.engine.sync()
    await mom.engine.sync()
    for (const device of [mom, momsIpad]) {
      expect(
        device.store
          .getState()
          .buddies.map((b) => b.inboxId)
          .sort()
      ).toEqual([anna.inboxId, joe.inboxId, sue.inboxId].sort())
      expect(device.store.getState().outgoingInvites).toHaveLength(1)
    }

    await mom.engine.removeBuddy(anna.inboxId)
    await mom.engine.cancelInvite(
      mom.store.getState().outgoingInvites[0].inviteId
    )
    await momsIpad.engine.sync()
    await mom.engine.sync()
    for (const device of [mom, momsIpad]) {
      expect(
        device.store.getState().buddies.map((b) => b.inboxId)
      ).not.toContain(anna.inboxId)
      expect(device.store.getState().outgoingInvites).toEqual([])
    }
    expect(fake.inboxes.get(mom.inboxId)!.slots.size).toBe(2)
  })

  it('fetches cards a device synced past before it learned of the buddy', async () => {
    const { offlineOps, user } = setup()
    const mom = user('Mom')
    const joe = user('Joe', {
      dayPlans: [dayPlan('2026-09-29', 60)],
      recurringPlans: [],
    })
    const momsIpad = user('Mom', { dayPlans: [], recurringPlans: [] }, mom.seed)
    await momsIpad.engine.sync()

    offlineOps.add('roster/put')
    await pair(mom, joe)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().buddies).toEqual([])

    offlineOps.clear()
    await mom.engine.createInvite()
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().cards[joe.inboxId].days).toEqual([
      { d: '2026-09-29', p: [{ m: 60 }] },
    ])
  })

  it('keeps retrying a removal the relay did not finish, waiting longer each time', async () => {
    const { fake, offlineOps, user, advance, setAfterOp } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    const annasSlotsInMomsInbox = () =>
      fake.inboxes.get(mom.inboxId)!.slots.size
    const tries: string[] = []
    setAfterOp(async (op) => {
      if (op === 'slot/remove') tries.push(op)
    })

    offlineOps.add('slot/leave')
    await expect(anna.engine.removeBuddy(mom.inboxId)).rejects.toEqual(
      new BuddyRemovalPendingError('buddy')
    )
    expect(anna.store.getState().buddies).toEqual([])
    expect(annasSlotsInMomsInbox()).toBe(1)
    expect(tries).toHaveLength(1)

    await anna.engine.sync()
    expect(tries).toHaveLength(1)
    advance(60 * 1000)
    await anna.engine.sync()
    expect(tries).toHaveLength(2)
    expect(annasSlotsInMomsInbox()).toBe(1)

    advance(60 * 1000)
    await anna.engine.sync()
    expect(tries).toHaveLength(2)

    offlineOps.clear()
    advance(60 * 1000)
    await anna.engine.sync()
    expect(annasSlotsInMomsInbox()).toBe(0)
    expect(anna.store.getState().pendingRemovals).toEqual([])
    await mom.engine.sync()
    expect(mom.store.getState().buddies).toEqual([])
  })

  it('wipes nothing until every buddy has been left', async () => {
    const { fake, offlineOps, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    offlineOps.add('slot/leave')
    await expect(mom.engine.deleteEverything()).rejects.toEqual(
      new BuddyRemovalPendingError('everything')
    )
    expect(fake.inboxes.has(mom.inboxId)).toBe(true)
    expect(fake.inboxes.get(anna.inboxId)!.slots.size).toBe(1)

    offlineOps.clear()
    await mom.engine.deleteEverything()
    expect(fake.inboxes.has(mom.inboxId)).toBe(false)
    expect(fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
  })

  it('re-registers a wiped inbox and resumes existing pairings', async () => {
    const { fake, user } = setup()
    const plans: Plans = { dayPlans: [], recurringPlans: [] }
    const mom = user('Mom')
    const anna = user('Anna', plans)
    await pair(mom, anna)

    fake.inboxes.delete(mom.inboxId)
    await mom.engine.sync()
    expect(mom.store.getState()).toMatchObject({
      registeredInboxId: mom.inboxId,
      slotsNeedRestore: false,
    })
    expect(mom.store.getState().buddies).toHaveLength(1)

    plans.dayPlans = [dayPlan('2026-09-30', 45)]
    await anna.engine.publishCards()
    await mom.engine.sync()
    expect(mom.store.getState().cards[anna.inboxId].days).toEqual([
      { d: '2026-09-30', p: [{ m: 45 }] },
    ])
  })

  it('never registers again an inbox it deleted, for a sync under way', async () => {
    const { fake, setAfterOp, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    let syncing: Promise<unknown> | null = null
    setAfterOp(async (op) => {
      if (op !== 'inbox/delete' || syncing) return
      syncing = mom.engine.sync().catch((error: unknown) => error)
      await syncing
    })
    await mom.engine.deleteEverything()
    expect(fake.inboxes.has(mom.inboxId)).toBe(false)
    expect(await syncing).toEqual(new RelayError('cancelled', 0))
  })

  it('registers the inbox again when its seed comes back after a delete', async () => {
    const { fake, user } = setup()
    const mom = user('Mom')
    await mom.engine.createInvite()
    await mom.engine.deleteEverything()
    expect(fake.inboxes.has(mom.inboxId)).toBe(false)

    mom.setRootSeed(mom.seed)
    await mom.engine.sync()
    expect(fake.inboxes.has(mom.inboxId)).toBe(true)
    expect(mom.store.getState().registeredInboxId).toBe(mom.inboxId)
  })

  it('deletes everything and leaves each buddy', async () => {
    const { fake, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    await mom.engine.deleteEverything()
    expect(fake.inboxes.has(mom.inboxId)).toBe(false)
    expect(mom.store.getState()).toMatchObject({
      buddies: [],
      registeredInboxId: null,
    })
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toEqual([])
  })
})

describe('leaving an account other devices keep', () => {
  const push = {
    apnsToken: 'ab',
    apnsEnvironment: 'sandbox' as const,
    templates: {},
  }

  it("signs this device out, keeping the inbox and buddies for the account's other devices", async () => {
    const { fake, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    const momsTablet = user(
      'Mom',
      { dayPlans: [], recurringPlans: [] },
      mom.seed
    )
    await momsTablet.engine.sync()
    await mom.engine.registerPush(push)
    await momsTablet.engine.registerPush(push)
    const devices = fake.inboxes.get(mom.inboxId)!.devices
    expect(devices.size).toBe(2)

    await mom.engine.leaveThisDevice()
    expect(fake.inboxes.has(mom.inboxId)).toBe(true)
    expect([...devices.keys()]).toEqual([momsTablet.store.getState().deviceId])
    expect(fake.inboxes.get(anna.inboxId)!.slots.size).toBe(1)
    expect(mom.store.getState()).toMatchObject({
      buddies: [],
      registeredInboxId: null,
      pendingRemovals: [],
    })

    await momsTablet.engine.sync()
    await anna.engine.sync()
    expect(momsTablet.store.getState().buddies).toMatchObject([
      { inboxId: anna.inboxId, status: 'active' },
    ])
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: mom.inboxId, status: 'active' },
    ])
  })

  it('starts nothing with the old seed until it is replaced', async () => {
    const { fake, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    await mom.engine.leaveThisDevice()

    await expect(mom.engine.sync()).rejects.toEqual(
      new RelayError('cancelled', 0)
    )
    expect(mom.store.getState().registeredInboxId).toBeNull()

    const sue = user('Sue')
    mom.setRootSeed(sue.seed)
    mom.engine.dropIdentity()
    await mom.engine.sync()
    expect(mom.store.getState().registeredInboxId).toBe(sue.inboxId)
    expect(fake.inboxes.get(mom.inboxId)!.slots.size).toBe(1)
  })

  it('finishes removals this device still owes before it leaves', async () => {
    const { fake, offlineOps, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    offlineOps.add('slot/leave')
    await expect(mom.engine.removeBuddy(anna.inboxId)).rejects.toEqual(
      new BuddyRemovalPendingError('buddy')
    )
    await expect(mom.engine.leaveThisDevice()).rejects.toEqual(
      new BuddyRemovalPendingError('everything')
    )
    expect(mom.store.getState().pendingRemovals).toHaveLength(1)

    offlineOps.clear()
    await mom.engine.leaveThisDevice()
    expect(fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
    expect(fake.inboxes.has(mom.inboxId)).toBe(true)
  })

  it('stays when its push registration can’t be taken off', async () => {
    const { offlineOps, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    await mom.engine.registerPush(push)
    offlineOps.add('device/unregister')
    await expect(mom.engine.leaveThisDevice()).rejects.toThrow()
    expect(mom.store.getState().buddies).toHaveLength(1)

    offlineOps.clear()
    await mom.engine.sync()
    expect(mom.store.getState().registeredInboxId).toBe(mom.inboxId)
  })

  it("starts over, telling no one, when another device's seed replaces this one's", async () => {
    const { fake, user } = setup()
    const anna = user('Anna')
    const sue = user('Sue')
    await pair(sue, anna)
    const mom = user('Mom')
    await pair(mom, anna)
    const momsTablet = user(
      'Mom',
      { dayPlans: [], recurringPlans: [] },
      mom.seed
    )
    await momsTablet.engine.sync()
    expect(momsTablet.store.getState().buddies).toHaveLength(1)

    momsTablet.setRootSeed(sue.seed)
    await momsTablet.engine.sync()
    expect(momsTablet.store.getState()).toMatchObject({
      registeredInboxId: sue.inboxId,
      removedBuddies: {},
    })
    expect(momsTablet.store.getState().buddies).toMatchObject([
      { inboxId: anna.inboxId, status: 'active' },
    ])

    await sue.engine.sync()
    expect(sue.store.getState().buddies).toMatchObject([
      { inboxId: anna.inboxId, status: 'active' },
    ])
    await mom.engine.sync()
    expect(mom.store.getState().buddies).toHaveLength(1)
    expect(fake.inboxes.get(anna.inboxId)!.slots.size).toBe(2)
  })
})

describe('Buddies data from a key this phone no longer has', () => {
  async function momWithLostKey() {
    const { fake, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    await mom.engine.registerPush({
      apnsToken: 'ab',
      apnsEnvironment: 'sandbox',
      templates: {},
    })
    mom.setRootSeed(random(32))
    return { fake, mom, anna }
  }

  it('Delete My Buddies Data lets go of it here and goes through', async () => {
    const { fake, mom, anna } = await momWithLostKey()
    await mom.engine.deleteEverything()
    expect(mom.store.getState()).toMatchObject({
      buddies: [],
      registeredInboxId: null,
      pendingRemovals: [],
    })

    expect(fake.inboxes.has(mom.inboxId)).toBe(true)
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: mom.inboxId },
    ])
  })

  it('signing this device out of Buddies lets go of it too', async () => {
    const { mom } = await momWithLostKey()
    await mom.engine.leaveThisDevice()
    expect(mom.store.getState()).toMatchObject({
      buddies: [],
      registeredInboxId: null,
    })
  })
})

describe('the name on Buddy Cards', () => {
  const nameAt = (viewer: User, inboxId: string) =>
    viewer.store.getState().buddies.find((b) => b.inboxId === inboxId)?.name

  it("is the account's, whichever device publishes, for a device joining it", async () => {
    const { user, advance } = setup()
    const mom = user('Maya Torres')
    const anna = user('Anna')
    await pair(mom, anna)
    await mom.engine.sync()

    advance(60_000)
    const momsTablet = user(
      'Verify',
      { dayPlans: [], recurringPlans: [] },
      mom.seed
    )
    await momsTablet.engine.sync()
    expect(momsTablet.store.getState().cardName?.name).toBe('Maya Torres')

    await momsTablet.engine.publishCards({ edited: true })
    await anna.engine.sync()
    expect(nameAt(anna, mom.inboxId)).toBe('Maya Torres')
  })

  it('follows a change the User makes on any device', async () => {
    const { fake, user, advance } = setup()
    const mom = user('Maya Torres')
    const anna = user('Anna')
    await pair(mom, anna)
    await mom.engine.sync()
    const momsTablet = user(
      'Verify',
      { dayPlans: [], recurringPlans: [] },
      mom.seed
    )
    await momsTablet.engine.sync()

    advance(60_000)
    momsTablet.profile.name = 'Maya T.'
    momsTablet.engine.setCardName('Maya T.')

    const roster = () => fake.inboxes.get(mom.inboxId)!.roster!.seq
    const before = roster()
    expect(momsTablet.timers).toHaveLength(1)
    momsTablet.timers.splice(0)[0].run()
    await vi.waitFor(() => expect(roster()).toBeGreaterThan(before))
    await momsTablet.engine.publishCards({ edited: true })
    await anna.engine.sync()
    expect(nameAt(anna, mom.inboxId)).toBe('Maya T.')

    advance(60_000)
    await mom.engine.sync()
    expect(mom.store.getState().cardName?.name).toBe('Maya T.')
    mom.setShares([])
    await mom.engine.publishCards({ edited: true })
    await anna.engine.sync()
    expect(nameAt(anna, mom.inboxId)).toBe('Maya T.')
  })

  it('settles on one name for devices that both ran Buddies before it was kept', async () => {
    const { user } = setup()
    const mom = user('Maya Torres')
    const anna = user('Anna')
    await pair(mom, anna)

    const momsTablet = user(
      'Theo',
      { dayPlans: [], recurringPlans: [] },
      mom.seed
    )
    await momsTablet.engine.sync()
    mom.store.setState({ cardName: null, startedAt: null })
    momsTablet.store.setState({ cardName: null, startedAt: null })

    await mom.engine.sync()
    await momsTablet.engine.sync()
    await mom.engine.sync()
    expect(mom.store.getState().cardName?.name).toBe(
      momsTablet.store.getState().cardName?.name
    )
  })
})

type User = ReturnType<ReturnType<typeof setup>['user']>

function relayPowers(fake: ReturnType<typeof setup>['fake']) {
  return {
    rosterBlob: (inboxId: string) => fake.inboxes.get(inboxId)!.roster!.blob,
    serveRoster(inboxId: string, blob: string) {
      const inbox = fake.inboxes.get(inboxId)!
      inbox.seq += 1
      inbox.roster = { blob, seq: inbox.seq }
    },
    listSlot(inboxId: string, slot: { slotId: string; writerPub: string }) {
      fake.inboxes
        .get(inboxId)!
        .slots.set(slot.slotId, { writerPub: slot.writerPub, createdAt: 0 })
    },
  }
}

function pairSlots(holder: User, peerInboxId: string) {
  const me = deriveIdentity(holder.seed)
  const peer = holder.store
    .getState()
    .buddies.find((b) => b.inboxId === peerInboxId)!
  const secret = derivePairSecret(
    me.dhPrivate,
    fromB64u(peer.dhPub),
    fromB64u(peer.inviteSecret),
    me.inboxId,
    peerInboxId
  )
  return {
    intoHolder: deriveDirection(secret, me.inboxId),

    intoPeer: deriveDirection(secret, peerInboxId),
  }
}

function openRoster(user: User, blob: string): Roster {
  const { rosterKey, inboxId } = deriveIdentity(user.seed)
  return JSON.parse(
    fromUtf8(open(rosterKey, blob, `ww-buddies/v1/roster|${inboxId}`))
  )
}

function sealLegacyRoster(user: User, roster: Roster): string {
  const { rosterKey, inboxId } = deriveIdentity(user.seed)
  const legacy: Partial<Roster> = { ...roster }
  delete legacy.version
  delete legacy.removedBuddies
  return seal(
    rosterKey,
    utf8(JSON.stringify(legacy)),
    `ww-buddies/v1/roster|${inboxId}`,
    random(12)
  )
}

describe('removed buddies stay removed', () => {
  it("doesn't bring a removed buddy back when the relay replays an old roster", async () => {
    const { fake, user } = setup()
    const relay = relayPowers(fake)
    const plans: Plans = {
      dayPlans: [dayPlan('2026-09-25', 120, 540)],
      recurringPlans: [],
    }
    const mom = user('Mom', plans)
    const anna = user('Anna')
    await pair(mom, anna)
    const rosterWithAnna = relay.rosterBlob(mom.inboxId)
    const slots = pairSlots(anna, mom.inboxId)

    await mom.engine.removeBuddy(anna.inboxId)
    expect(mom.store.getState().removedBuddies).toHaveProperty(anna.inboxId)

    relay.listSlot(anna.inboxId, slots.intoHolder)
    plans.dayPlans = [dayPlan('2026-09-30', 180, 600)]
    relay.serveRoster(mom.inboxId, rosterWithAnna)
    relay.listSlot(mom.inboxId, slots.intoPeer)
    await mom.engine.sync()

    expect(mom.store.getState().buddies).toEqual([])
    expect(
      fake.inboxes.get(anna.inboxId)!.cards.has(slots.intoHolder.slotId)
    ).toBe(false)

    expect(openRoster(mom, relay.rosterBlob(mom.inboxId))).toMatchObject({
      buddies: [],
      removedBuddies: { [anna.inboxId]: expect.any(Number) },
    })
  })

  it('ignores a roster older than one it has seen, even without a tombstone', async () => {
    const { fake, user } = setup()
    const relay = relayPowers(fake)
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    const rosterWithAnna = relay.rosterBlob(mom.inboxId)
    const slots = pairSlots(anna, mom.inboxId)
    await mom.engine.removeBuddy(anna.inboxId)

    mom.store.setState({ removedBuddies: {} })
    relay.listSlot(anna.inboxId, slots.intoHolder)
    relay.serveRoster(mom.inboxId, rosterWithAnna)
    relay.listSlot(mom.inboxId, slots.intoPeer)
    await mom.engine.sync()

    expect(mom.store.getState().buddies).toEqual([])
    expect(
      openRoster(mom, relay.rosterBlob(mom.inboxId)).version
    ).toBeGreaterThan(openRoster(mom, rosterWithAnna).version!)
  })

  it('merges a roster from an older build without undoing a removal', async () => {
    const { fake, offlineOps, user } = setup()
    const relay = relayPowers(fake)
    const mom = user('Mom')
    const anna = user('Anna')
    const joe = user('Joe', {
      dayPlans: [dayPlan('2026-09-29', 60)],
      recurringPlans: [],
    })
    await pair(mom, anna)
    const momsIpad = user('Mom', { dayPlans: [], recurringPlans: [] }, mom.seed)
    await momsIpad.engine.sync()
    const before = openRoster(mom, relay.rosterBlob(mom.inboxId))
    const slots = pairSlots(anna, mom.inboxId)
    await mom.engine.removeBuddy(anna.inboxId)
    const version = mom.store.getState().rosterVersion

    offlineOps.add('roster/put')
    await pair(momsIpad, joe)
    offlineOps.clear()
    const joeOnIpad = momsIpad.store
      .getState()
      .buddies.find((b) => b.inboxId === joe.inboxId)!
    relay.serveRoster(
      mom.inboxId,
      sealLegacyRoster(mom, {
        ...before,
        buddies: [...before.buddies, { ...joeOnIpad, showOnCalendar: true }],
      })
    )
    relay.listSlot(anna.inboxId, slots.intoHolder)
    relay.listSlot(mom.inboxId, slots.intoPeer)
    await mom.engine.sync()

    expect(mom.store.getState().buddies.map((b) => b.inboxId)).toEqual([
      joe.inboxId,
    ])
    expect(
      fake.inboxes.get(anna.inboxId)!.cards.has(slots.intoHolder.slotId)
    ).toBe(false)
    expect(mom.store.getState().cards[joe.inboxId].days).toEqual([
      { d: '2026-09-29', p: [{ m: 60 }] },
    ])

    const written = openRoster(mom, relay.rosterBlob(mom.inboxId))
    expect(written.removedBuddies).toHaveProperty(anna.inboxId)
    expect(written.version).toBeGreaterThan(version)
  })

  it("doesn't bring back a claim the User turned down", async () => {
    const { advance, fake, user } = setup()
    const relay = relayPowers(fake)
    const mom = user('Mom')
    const anna = user('Anna')
    const link = await mom.engine.createInvite()
    await anna.engine.acceptInvite(link)
    await mom.engine.sync()
    const rosterWithClaim = relay.rosterBlob(mom.inboxId)
    expect(openRoster(mom, rosterWithClaim).incomingClaims).toHaveLength(1)

    await mom.engine.rejectClaim(
      mom.store.getState().incomingClaims[0].inviteId
    )
    relay.serveRoster(mom.inboxId, rosterWithClaim)
    await mom.engine.sync()
    expect(mom.store.getState()).toMatchObject({
      incomingClaims: [],
      outgoingInvites: [],
    })

    advance(INVITE_TTL_MS + 1)
    await mom.engine.sync()
    expect(mom.store.getState().closedInviteIds).toEqual({})
    relay.serveRoster(
      mom.inboxId,
      sealLegacyRoster(mom, openRoster(mom, rosterWithClaim))
    )
    await mom.engine.sync()
    expect(mom.store.getState()).toMatchObject({
      incomingClaims: [],
      outgoingInvites: [],
    })
  })

  it("can't confirm a claim that lapsed while it was still listed", async () => {
    const { advance, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await anna.engine.acceptInvite(await mom.engine.createInvite())
    await mom.engine.sync()
    const [claim] = mom.store.getState().incomingClaims

    advance(INVITE_TTL_MS + 1)
    await expect(mom.engine.confirmClaim(claim.inviteId)).rejects.toEqual(
      new BuddyInviteError('unavailable')
    )
    expect(mom.store.getState()).toMatchObject({
      buddies: [],
      incomingClaims: [],
    })
  })

  it('lets the User pair again with someone they removed, on every device', async () => {
    const { fake, user } = setup()
    const relay = relayPowers(fake)
    const mom = user('Mom', {
      dayPlans: [dayPlan('2026-09-26', 60)],
      recurringPlans: [],
    })
    const anna = user('Anna')
    await pair(mom, anna)
    const momsIpad = user('Mom', { dayPlans: [], recurringPlans: [] }, mom.seed)
    await momsIpad.engine.sync()
    const oldPairing = mom.store.getState().buddies[0].inviteSecret
    const rosterWithAnna = relay.rosterBlob(mom.inboxId)

    await mom.engine.removeBuddy(anna.inboxId)
    await momsIpad.engine.sync()
    await anna.engine.sync()
    expect(momsIpad.store.getState().removedBuddies).toHaveProperty(
      anna.inboxId
    )
    expect(anna.store.getState().removedBuddies).toHaveProperty(mom.inboxId)

    const link = await anna.engine.createInvite()
    await mom.engine.acceptInvite(link)
    await anna.engine.sync()
    await anna.engine.confirmClaim(
      anna.store.getState().incomingClaims[0].inviteId
    )
    await mom.engine.sync()
    await anna.engine.sync()
    await momsIpad.engine.sync()

    for (const device of [mom, momsIpad])
      expect(device.store.getState()).toMatchObject({
        buddies: [{ inboxId: anna.inboxId, status: 'active' }],
        removedBuddies: {},
      })
    expect(anna.store.getState()).toMatchObject({
      buddies: [{ inboxId: mom.inboxId, status: 'active' }],
      removedBuddies: {},
    })
    expect(anna.store.getState().cards[mom.inboxId].days).toEqual([
      { d: '2026-09-26', p: [{ m: 60 }] },
    ])

    relay.serveRoster(mom.inboxId, rosterWithAnna)
    await mom.engine.sync()
    expect(mom.store.getState().buddies).toHaveLength(1)
    expect(mom.store.getState().buddies[0].inviteSecret).not.toBe(oldPairing)
  })

  it("carries a removal to the User's other devices before the relay has it", async () => {
    const { fake, offlineOps, user, advance } = setup()
    const plans: Plans = { dayPlans: [], recurringPlans: [] }
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    const momsIpad = user('Mom', plans, mom.seed)
    await momsIpad.engine.sync()
    const slots = pairSlots(mom, anna.inboxId)
    const cardForAnna = () =>
      fake.inboxes.get(anna.inboxId)!.cards.get(slots.intoPeer.slotId)?.blob
    const cardBefore = cardForAnna()

    offlineOps.add('slot/remove')
    await expect(mom.engine.removeBuddy(anna.inboxId)).rejects.toEqual(
      new BuddyRemovalPendingError('buddy')
    )
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().buddies).toEqual([])
    plans.dayPlans = [dayPlan('2026-09-28', 60)]
    await momsIpad.engine.publishCards()
    expect(cardForAnna()).toBe(cardBefore)

    offlineOps.clear()
    advance(60 * 1000)
    await momsIpad.engine.sync()
    expect(fake.inboxes.get(mom.inboxId)!.slots.size).toBe(0)
    expect(cardForAnna()).toBeUndefined()
  })

  it("doesn't let a device that missed a removal end the pairing made since", async () => {
    const { advance, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    const momsIpad = user('Mom', { dayPlans: [], recurringPlans: [] }, mom.seed)
    await momsIpad.engine.sync()

    await mom.engine.removeBuddy(anna.inboxId)
    await anna.engine.sync()
    advance(60_000)
    await pair(mom, anna)

    await momsIpad.engine.sync()
    await mom.engine.sync()
    await momsIpad.engine.sync()

    for (const device of [mom, momsIpad])
      expect(device.store.getState().buddies).toMatchObject([
        { inboxId: anna.inboxId, status: 'active' },
      ])
  })

  it('writes rosters that older builds still read', async () => {
    const { fake, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    await mom.engine.removeBuddy(anna.inboxId)
    const written = openRoster(mom, relayPowers(fake).rosterBlob(mom.inboxId))
    expect(written).toMatchObject({
      version: expect.any(Number),
      removedBuddies: { [anna.inboxId]: expect.any(Number) },
    })

    const olderBuild = rosterSchema.omit({
      version: true,
      removedBuddies: true,
    })
    const parsed = olderBuild.parse(written)
    expect(parsed).not.toHaveProperty('version')
    expect(parsed).not.toHaveProperty('removedBuddies')
  })

  it('keeps the newest tombstones, and a full roster fits the relay cap', () => {
    const id = () => toB64u(random(16))
    const removed = Object.fromEntries(
      Array.from({ length: MAX_REMOVED_BUDDIES + 5 }, (_, index) => [
        id(),
        1_790_000_000_000 + index,
      ])
    )
    const kept = mergeRemovedBuddies({}, removed)
    expect(Object.keys(kept)).toHaveLength(MAX_REMOVED_BUDDIES)
    expect(Math.min(...Object.values(kept))).toBe(1_790_000_000_005)

    const at = 1_790_000_000_000
    const name = 'N'.repeat(60)
    const avatar = { t: 'emoji', v: '🧑🏽‍🦱' } as const
    const tenure = { kind: 'regularAuxiliary', since: '2019-09' } as const
    const dhPub = () => toB64u(random(32))
    const roster: Roster = {
      v: 1,
      version: 1_000_000,
      buddies: Array.from({ length: 5 }, (_, colorIndex) => ({
        inboxId: id(),
        name,
        nickname: name,
        avatar,
        tenure,
        dhPub: dhPub(),
        inviteSecret: id(),
        status: 'active',
        pairedAt: at,
        colorIndex,
        color: '#A855F7FF',
        showOnCalendar: true,
      })),
      outgoingInvites: Array.from({ length: 5 }, () => ({
        inviteId: id(),
        secret: id(),
        createdAt: at,
        expiresAt: at,
      })),
      incomingClaims: Array.from({ length: 5 }, () => ({
        inviteId: id(),
        secret: id(),
        name,
        avatar,
        tenure,
        dhPub: dhPub(),
        inboxId: id(),
        receivedAt: at,
        expiresAt: at,
      })),

      closedInviteIds: Object.fromEntries(
        Array.from({ length: 140 }, () => [id(), at])
      ),
      removedBuddies: kept,
      sharing: { photo: true, tenure: true, streak: true, updatedAt: at },
      answers: {},
      read: {},
      dismissed: {},
      cars: {},
      leftCars: {},
    }
    const plaintext = utf8(JSON.stringify(rosterSchema.parse(roster)))

    expect(plaintext.length).toBeLessThan(32 * 1024 - 29)
  })
})

describe('shared Plans and Follow-ups', () => {
  const HOUR = 60 * 60 * 1000
  const saturday = {
    d: '2026-09-26',
    s: 600,
    m: 120,
    title: 'Cart witnessing',
    location: { name: "McDonald's", address: '1 Main St' },
    note: 'Bring the cart https://example.com/cart',
  }
  const planSpec = (
    recipients: string[],
    details = saturday
  ): OutgoingShareSpec => ({
    key: planShareKey('sat'),
    type: 'plan',
    details,
    recipients,
    endsAt: Date.parse('2026-09-27T00:00:00Z'),
    expiresAt: Date.parse('2026-09-28T00:00:00Z'),
  })

  async function trio() {
    const env = setup()
    const levi = env.user('Levi')
    const anna = env.user('Anna')
    const mom = env.user('Mom')
    await pair(levi, anna)
    await pair(levi, mom)
    return { ...env, levi, anna, mom }
  }

  describe('invitations that never reach a buddy', () => {
    async function leviAndAnna() {
      const env = setup()
      const notSent: { reason: string; names: string[] }[] = []
      const levi = env.user('Levi', undefined, undefined, {
        onSharesNotSent: (report) => notSent.push(report),
      })
      const anna = env.user('Anna')
      await pair(levi, anna)
      const account = () =>
        [...env.fake.accounts.values()].find(
          (candidate) =>
            candidate.accountPub ===
            deriveAccountSigningKey(levi.seed).publicKey
        )!
      return { ...env, levi, anna, notSent, account }
    }
    const key = planShareKey('sat')

    it("drops one refused while suspended, says so, and doesn't send it after reinstatement", async () => {
      const { levi, anna, notSent, account, advance } = await leviAndAnna()
      account().status = 'suspended'
      levi.setShares([planSpec([anna.inboxId])])
      await expect(levi.engine.publishShares()).rejects.toMatchObject({
        code: 'suspended',
      })
      expect(notSent).toEqual([{ reason: 'suspended', names: ['Anna'] }])
      expect(levi.store.getState().unsentShares[key]).toMatchObject({
        [anna.inboxId]: { reason: 'suspended', name: 'Anna' },
      })
      expect(levi.store.getState().outgoingShares[key].sent).toEqual({})

      account().status = 'active'
      advance(60_000)
      await levi.engine.publishShares()
      await anna.engine.sync()
      expect(Object.keys(anna.store.getState().incomingShares)).toEqual([])
      expect(notSent).toHaveLength(1)

      levi.setShares([
        planSpec([anna.inboxId], { ...saturday, title: 'Moved' }),
      ])
      await levi.engine.publishShares()
      await anna.engine.sync()
      expect(Object.values(anna.store.getState().incomingShares)).toMatchObject(
        [{ details: { title: 'Moved' } }]
      )
      expect(levi.store.getState().unsentShares).toEqual({})
    })

    it('says so when the pairing ended before the invitation went', async () => {
      const { levi, anna, notSent } = await leviAndAnna()

      await anna.engine.removeBuddy(levi.inboxId)
      levi.setShares([planSpec([anna.inboxId])])
      await levi.engine.publishShares()
      expect(notSent).toEqual([{ reason: 'gone', names: ['Anna'] }])
      expect(levi.store.getState().buddies).toEqual([])
      expect(levi.store.getState().unsentShares[key]).toMatchObject({
        [anna.inboxId]: { reason: 'gone', name: 'Anna' },
      })
      expect(levi.store.getState().outgoingShares[key]?.sent ?? {}).toEqual({})
    })

    it("says so when a sync finds a coming Plan's buddy left before it was sent", async () => {
      const { levi, anna, notSent } = await leviAndAnna()
      levi.setShares([planSpec([anna.inboxId])])
      await anna.engine.removeBuddy(levi.inboxId)

      levi.setEnabled(false)
      await levi.engine.sync().catch(() => undefined)
      expect(levi.store.getState().unsentShares[key]).toMatchObject({
        [anna.inboxId]: { reason: 'gone', name: 'Anna' },
      })
      expect(notSent).toEqual([{ reason: 'gone', names: ['Anna'] }])

      levi.setEnabled(true)
      levi.setShares([planSpec([])])
      await levi.engine.publishShares()
      expect(levi.store.getState().unsentShares[key]).toMatchObject({
        [anna.inboxId]: { reason: 'gone', name: 'Anna' },
      })
      levi.setShares([])
      await levi.engine.publishShares()
      expect(levi.store.getState().unsentShares).toEqual({})
    })

    it('notes a buddy the User removed before it was sent, without an alert', async () => {
      const { levi, anna, notSent } = await leviAndAnna()
      levi.setShares([planSpec([anna.inboxId])])
      levi.setEnabled(false)
      await levi.engine.removeBuddy(anna.inboxId).catch(() => undefined)
      expect(levi.store.getState().unsentShares[key]).toMatchObject({
        [anna.inboxId]: { reason: 'gone', name: 'Anna' },
      })
      expect(notSent).toEqual([])
    })

    it("doesn't retry an invitation to a buddy whose inbox is gone, and says so", async () => {
      const { levi, anna, notSent, fake } = await leviAndAnna()

      fake.inboxes.delete(anna.inboxId)
      levi.setShares([planSpec([anna.inboxId])])
      await levi.engine.publishShares()
      expect(notSent).toEqual([{ reason: 'gone', names: ['Anna'] }])
      expect(levi.store.getState().unsentShares[key]).toMatchObject({
        [anna.inboxId]: { reason: 'gone', name: 'Anna' },
      })
      expect(levi.store.getState().outgoingShares[key].sent).toEqual({})

      const putEvents = () =>
        fake.requests.filter((request) => request.op === 'event/put').length
      const before = putEvents()
      await levi.engine.publishShares()
      expect(putEvents()).toBe(before)
      expect(notSent).toHaveLength(1)
    })

    describe('once the app takes the gone buddy off the Plan', () => {
      async function wiredLevi(invited: ('anna' | 'mom')[]) {
        const env = setup()
        const notSent: { reason: string; names: string[] }[] = []

        let dayPlans: DayPlan[] = [
          {
            ...dayPlan('2026-09-26', 120, 600),
            id: 'sat',
            title: 'Cart witnessing',
          },
        ]
        const extra = {
          getShares: () =>
            buildOutgoingShares({
              dayPlans,
              visits: [],
              contacts: [],
              now: env.now(),
            }),
          shareEndsAt: (shareKey: string) =>
            shareEndsAt(shareKey, { dayPlans, visits: [] }),
          onSharesNotSent: (report: { reason: string; names: string[] }) =>
            notSent.push(report),
        }
        const levi = env.user('Levi', undefined, undefined, extra)
        const anna = env.user('Anna')
        const mom = env.user('Mom')
        await pair(levi, anna)
        await pair(levi, mom)
        const ids = { anna: anna.inboxId, mom: mom.inboxId }
        dayPlans = [{ ...dayPlans[0], buddies: invited.map((who) => ids[who]) }]
        let roster = new Set(
          levi.store.getState().buddies.map((b) => b.inboxId)
        )

        const forgetGone = (device = levi) => {
          const current = new Set(
            device.store.getState().buddies.map((b) => b.inboxId)
          )
          const removed = new Set([...roster].filter((id) => !current.has(id)))
          roster = current
          const changes = forgetBuddiesInData(dayPlans, [], removed)
          dayPlans = dayPlans.map((plan) => ({
            ...plan,
            ...changes.dayPlans.find((change) => change.id === plan.id),
          }))
        }

        const relaunch = () => {
          const saved = JSON.parse(JSON.stringify(levi.store.getState()))
          const next = env.user('Levi', undefined, levi.seed, extra)
          next.store.setState(saved)
          return next
        }
        const planInvites = () => dayPlans[0].buddies ?? []
        return {
          ...env,

          levisIpad: () => env.user('Levi', undefined, levi.seed),
          levi,
          anna,
          mom,
          notSent,
          forgetGone,
          relaunch,
          planInvites,
          deletePlan: () => {
            dayPlans = []
          },
        }
      }
      const goneRow = {
        reason: 'gone',
        name: 'Anna',
      }

      it.each([
        ['her alone', ['anna'] as const],
        ['her and another buddy', ['anna', 'mom'] as const],
      ])(
        'keeps "Not sent" when a sync finds she left before it went (offline save), inviting %s',
        async (_label, invited) => {
          const {
            levi,
            anna,
            mom,
            notSent,
            forgetGone,
            relaunch,
            planInvites,
          } = await wiredLevi([...invited])

          levi.setEnabled(false)
          await anna.engine.removeBuddy(levi.inboxId)
          await levi.engine.sync().catch(() => undefined)
          expect(notSent).toEqual([{ reason: 'gone', names: ['Anna'] }])
          forgetGone()
          expect(planInvites()).not.toContain(anna.inboxId)

          levi.setEnabled(true)
          await levi.engine.sync()
          await levi.engine.publishShares()
          await levi.engine.sync()
          expect(levi.store.getState().unsentShares[key]).toMatchObject({
            [anna.inboxId]: goneRow,
          })
          if (invited.length > 1) {
            await mom.engine.sync()
            expect(
              Object.keys(mom.store.getState().incomingShares)
            ).toHaveLength(1)
          }

          const relaunched = relaunch()
          await relaunched.engine.sync()
          await relaunched.engine.publishShares()
          expect(relaunched.store.getState().unsentShares[key]).toMatchObject({
            [anna.inboxId]: goneRow,
          })
          expect(notSent).toHaveLength(1)
        }
      )

      it.each([
        ['her alone', ['anna'] as const],
        ['her and another buddy', ['anna', 'mom'] as const],
      ])(
        'keeps "Not sent" when the relay says she left as it went (gone), inviting %s',
        async (_label, invited) => {
          const { levi, anna, notSent, forgetGone, planInvites } =
            await wiredLevi([...invited])

          await anna.engine.removeBuddy(levi.inboxId)
          await levi.engine.publishShares()
          expect(notSent).toEqual([{ reason: 'gone', names: ['Anna'] }])
          forgetGone()
          expect(planInvites()).not.toContain(anna.inboxId)

          await levi.engine.publishShares()
          await levi.engine.sync()
          await levi.engine.publishShares()
          expect(levi.store.getState().unsentShares[key]).toMatchObject({
            [anna.inboxId]: goneRow,
          })
          expect(notSent).toHaveLength(1)
        }
      )

      it.each([
        ['her alone', ['anna'] as const],
        ['her and another buddy', ['anna', 'mom'] as const],
      ])(
        'keeps "Not sent" when her inbox was gone (not_found) and a sync later drops her, inviting %s',
        async (_label, invited) => {
          const { levi, anna, fake, notSent, forgetGone, relaunch } =
            await wiredLevi([...invited])

          await anna.engine.removeBuddy(levi.inboxId)
          fake.inboxes.delete(anna.inboxId)
          await levi.engine.publishShares()
          expect(notSent).toEqual([{ reason: 'gone', names: ['Anna'] }])
          expect(levi.store.getState().unsentShares[key]).toMatchObject({
            [anna.inboxId]: goneRow,
          })

          await levi.engine.sync()
          forgetGone()
          await levi.engine.publishShares()
          await levi.engine.sync()
          expect(levi.store.getState().unsentShares[key]).toMatchObject({
            [anna.inboxId]: goneRow,
          })
          const relaunched = relaunch()
          await relaunched.engine.publishShares()
          expect(relaunched.store.getState().unsentShares[key]).toMatchObject({
            [anna.inboxId]: goneRow,
          })
          expect(notSent).toHaveLength(1)
        }
      )

      it("keeps it when Levi's other phone saw her leave first (offline save)", async () => {
        const {
          levi,
          anna,
          notSent,
          forgetGone,
          levisIpad: ipad,
        } = await wiredLevi(['anna'])
        const levisIpad = ipad()
        await levisIpad.engine.sync()

        levi.setEnabled(false)
        await anna.engine.removeBuddy(levi.inboxId)
        await levisIpad.engine.sync()
        const listsAnna = (device: typeof levi) =>
          device.store
            .getState()
            .buddies.some((buddy) => buddy.inboxId === anna.inboxId)
        expect(listsAnna(levisIpad)).toBe(false)
        await levi.engine.sync().catch(() => undefined)
        expect(listsAnna(levi)).toBe(false)
        expect(levi.store.getState().unsentShares[key]).toMatchObject({
          [anna.inboxId]: goneRow,
        })
        expect(notSent.length).toBeLessThanOrEqual(1)

        forgetGone()
        levi.setEnabled(true)
        await levi.engine.sync()
        expect(levi.store.getState().unsentShares[key]).toMatchObject({
          [anna.inboxId]: goneRow,
        })
      })

      it.each(['over', 'deleted'])(
        'lets it go once the Plan is %s',
        async (end) => {
          const { levi, anna, advance, forgetGone, deletePlan } =
            await wiredLevi(['anna'])
          await anna.engine.removeBuddy(levi.inboxId)
          await levi.engine.publishShares()
          forgetGone()
          await levi.engine.publishShares()
          expect(levi.store.getState().unsentShares[key]).toBeDefined()

          if (end === 'over') advance(4 * 24 * HOUR)
          else deletePlan()
          await levi.engine.publishShares()
          expect(levi.store.getState().unsentShares).toEqual({})
        }
      )

      it("lets it go once they're buddies again", async () => {
        const { levi, anna, forgetGone } = await wiredLevi(['anna'])
        await anna.engine.removeBuddy(levi.inboxId)
        await levi.engine.publishShares()
        forgetGone()
        await levi.engine.publishShares()
        expect(levi.store.getState().unsentShares[key]).toBeDefined()

        await pair(levi, anna)
        forgetGone()
        await levi.engine.publishShares()
        expect(levi.store.getState().unsentShares).toEqual({})
      })
    })
  })

  it('invites buddies, and replies come back to the sender', async () => {
    const { fake, levi, anna, mom } = await trio()
    levi.setShares([planSpec([anna.inboxId, mom.inboxId])])
    await levi.engine.publishShares()
    expect(fake.pushes).toContainEqual({
      inboxId: anna.inboxId,
      kind: 'plan.invite',
    })

    await anna.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    const key = incomingShareKey(levi.inboxId, shareId)
    expect(anna.store.getState().incomingShares[key]).toMatchObject({
      type: 'plan',
      status: 'pending',
      details: saturday,
    })
    expect(anna.store.getState().notifications[0]).toMatchObject({
      kind: 'shareInvite',
      name: 'Levi',
      shareKey: key,
      read: false,
    })

    await anna.engine.replyToShare(key, 'going')
    expect(anna.store.getState().incomingShares[key].status).toBe('going')
    await levi.engine.sync()
    expect(levi.store.getState().shareReplies[shareId]).toMatchObject({
      [anna.inboxId]: { status: 'going' },
    })
    expect(levi.store.getState().notifications[0]).toMatchObject({
      kind: 'shareReply',
      reply: 'going',
      name: 'Anna',
    })
  })

  it("sends Going at once and holds Can't Make It in case it was a mistake", async () => {
    const { levi, anna, advance } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    const key = incomingShareKey(levi.inboxId, shareId)
    const reply = (answer: ShareReply) =>
      anna.engine.replyToShare(key, answer, { holdMs: replyHoldMs(answer) })
    const received = async () => {
      await levi.engine.sync()
      return levi.store.getState().shareReplies[shareId]?.[anna.inboxId]
    }

    await reply('declined')
    advance(5_000)
    await anna.engine.sync()
    expect(await received()).toBeUndefined()

    await reply('going')
    expect(await received()).toMatchObject({ status: 'going' })
    advance(REPLY_HOLD_MS)
    await anna.engine.deliverReplies()
    expect(await received()).toMatchObject({ status: 'going' })

    await reply('declined')
    advance(REPLY_HOLD_MS - 1_000)
    await anna.engine.deliverReplies()
    expect(await received()).toMatchObject({ status: 'going' })
    advance(1_000)
    await anna.engine.deliverReplies()
    expect(await received()).toMatchObject({ status: 'declined' })
    expect(anna.store.getState().incomingShares[key]).toMatchObject({
      unsentReplyRev: undefined,
      replySendAt: undefined,
    })
  })

  it('sends held answers at once when asked, e.g. leaving the app', async () => {
    const { levi, anna } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    const key = incomingShareKey(levi.inboxId, shareId)

    await anna.engine.replyToShare(key, 'declined', {
      holdMs: replyHoldMs('declined'),
    })
    await anna.engine.sendHeldReplies()
    await levi.engine.sync()
    expect(levi.store.getState().shareReplies[shareId]).toMatchObject({
      [anna.inboxId]: { status: 'declined' },
    })
  })

  it('sends nothing for an unchanged share and updates only on change', async () => {
    const { fake, levi, anna, advance } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const key = Object.keys(anna.store.getState().incomingShares)[0]
    await anna.engine.replyToShare(key, 'going')

    const pushesBefore = fake.pushes.length
    advance(60_000)
    await levi.engine.publishShares()
    expect(fake.pushes.length).toBe(pushesBefore)

    advance(60_000)
    levi.setShares([planSpec([anna.inboxId], { ...saturday, s: 660 })])
    await levi.engine.publishShares()
    expect(fake.pushes.at(-1)).toEqual({
      inboxId: anna.inboxId,
      kind: 'plan.update',
    })
    await anna.engine.sync()
    const share = anna.store.getState().incomingShares[key]
    expect(share.details.s).toBe(660)

    expect(share.status).toBe('going')
    const entries = anna.store
      .getState()
      .notifications.filter((n) => n.shareKey === key)
    expect(entries.map((n) => n.kind)).toEqual(['shareUpdate'])
  })

  it('quietly drops a buddy who had not said they were going', async () => {
    const { fake, levi, mom, advance } = await trio()
    levi.setShares([planSpec([mom.inboxId])])
    await levi.engine.publishShares()
    await mom.engine.sync()
    expect(mom.store.getState().notifications.map((n) => n.kind)).toEqual([
      'shareInvite',
      'paired',
    ])
    const inviteSeq = mom.store.getState().notifications[0].seq

    advance(60_000)
    const pushesBefore = fake.pushes.length
    levi.setShares([planSpec([])])
    await levi.engine.publishShares()
    expect(fake.pushes.length).toBe(pushesBefore)
    await mom.engine.sync()
    const [momShare] = Object.values(mom.store.getState().incomingShares)
    expect(momShare.status).toBe('cancelled')
    expect(mom.store.getState().notifications.map((n) => n.kind)).toEqual([
      'paired',
    ])

    expect(mom.dismissed).toEqual([[inviteSeq]])
  })

  it('tells a dropped buddy who was going, and everyone when a Plan is deleted', async () => {
    const { fake, levi, anna, mom, advance } = await trio()
    levi.setShares([planSpec([anna.inboxId, mom.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const annaKey = Object.keys(anna.store.getState().incomingShares)[0]
    await anna.engine.replyToShare(annaKey, 'going')
    await levi.engine.sync()

    advance(60_000)
    levi.setShares([planSpec([mom.inboxId])])
    await levi.engine.publishShares()
    expect(fake.pushes.at(-1)).toEqual({
      inboxId: anna.inboxId,
      kind: 'plan.cancel',
    })
    await anna.engine.sync()
    expect(anna.store.getState().incomingShares[annaKey].status).toBe(
      'cancelled'
    )
    expect(anna.store.getState().notifications[0].kind).toBe('shareCancel')
    expect(anna.dismissed).toEqual([])

    advance(60_000)
    levi.setShares([])
    await levi.engine.publishShares()
    expect(levi.store.getState().outgoingShares).toEqual({})
    expect(fake.pushes.at(-1)).toEqual({
      inboxId: mom.inboxId,
      kind: 'plan.cancel',
    })
    await mom.engine.sync()
    const [momShare] = Object.values(mom.store.getState().incomingShares)
    expect(momShare.status).toBe('cancelled')
    expect(mom.store.getState().notifications.map((n) => n.kind)).toEqual([
      'shareCancel',
      'paired',
    ])
  })

  it("lists who's going for everyone invited, answered or not", async () => {
    const { fake, levi, anna, mom, advance } = await trio()
    levi.setShares([planSpec([anna.inboxId, mom.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    await mom.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    const annaKey = Object.keys(anna.store.getState().incomingShares)[0]
    const momKey = Object.keys(mom.store.getState().incomingShares)[0]
    const people = (user: typeof anna, key: string) => {
      const { people, more } = user.store.getState().incomingShares[key]
      return { people, more }
    }
    const pushes = fake.pushes.length

    await anna.engine.replyToShare(annaKey, 'going')
    await levi.engine.sync()

    expect(
      levi.store.getState().shareReplies[shareId][anna.inboxId]
    ).toMatchObject({ status: 'going', listed: true, photo: true })
    await anna.engine.sync()
    await mom.engine.sync()

    expect(people(mom, momKey)).toEqual({
      people: [{ t: guestTag(shareId, anna.inboxId), n: 'Anna' }],
    })
    expect(people(anna, annaKey)).toEqual({})

    await mom.engine.replyToShare(momKey, 'going')
    await levi.engine.sync()
    await anna.engine.sync()
    await mom.engine.sync()

    expect(people(anna, annaKey)).toEqual({
      people: [{ t: guestTag(shareId, mom.inboxId), n: 'Mom' }],
    })
    expect(people(mom, momKey)).toEqual({
      people: [{ t: guestTag(shareId, anna.inboxId), n: 'Anna' }],
    })

    expect(
      fake.pushes.slice(pushes).filter((push) => push.kind === 'plan.update')
    ).toEqual([])
    for (const user of [anna, mom])
      expect(
        user.store.getState().notifications.map((n) => n.kind)
      ).not.toContain('shareUpdate')

    advance(60_000)
    await mom.engine.replyToShare(momKey, 'declined')
    await levi.engine.sync()
    await anna.engine.sync()
    await mom.engine.sync()
    expect(people(anna, annaKey)).toEqual({})
    expect(people(mom, momKey)).toEqual({
      people: [{ t: guestTag(shareId, anna.inboxId), n: 'Anna' }],
    })
  })

  it("gives someone invited later the list of who's already going", async () => {
    const { levi, anna, mom } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const annaKey = Object.keys(anna.store.getState().incomingShares)[0]
    await anna.engine.replyToShare(annaKey, 'going')
    await levi.engine.sync()

    levi.setShares([planSpec([anna.inboxId, mom.inboxId])])
    await levi.engine.publishShares()
    await mom.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    const [invitation] = Object.values(mom.store.getState().incomingShares)
    expect(invitation).toMatchObject({
      status: 'pending',
      people: [{ t: guestTag(shareId, anna.inboxId), n: 'Anna' }],
    })
  })

  it('counts someone going whose app predates the list, unnamed', async () => {
    const { levi, anna, mom } = await trio()
    levi.setShares([planSpec([anna.inboxId, mom.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    await mom.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    const annaKey = Object.keys(anna.store.getState().incomingShares)[0]
    const momKey = Object.keys(mom.store.getState().incomingShares)[0]
    await anna.engine.replyToShare(annaKey, 'going')
    await mom.engine.replyToShare(momKey, 'going')
    await levi.engine.sync()

    levi.store.setState((state) => ({
      shareReplies: {
        ...state.shareReplies,
        [shareId]: {
          ...state.shareReplies[shareId],
          [mom.inboxId]: { status: 'going', rev: 1, at: 1 },
        },
      },
    }))
    await levi.engine.publishShares()
    await anna.engine.sync()
    const { people, more } = anna.store.getState().incomingShares[annaKey]
    expect(people).toBeUndefined()
    expect(more).toBe(1)
  })

  it('wipes invitations once they lapse and when the buddy is removed', async () => {
    const { levi, anna } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    expect(Object.keys(anna.store.getState().incomingShares)).toHaveLength(1)

    await anna.engine.removeBuddy(levi.inboxId)
    expect(anna.store.getState().incomingShares).toEqual({})
    expect(
      anna.store.getState().notifications.some((n) => n.from === levi.inboxId)
    ).toBe(false)

    const again = await trio()
    again.levi.setShares([planSpec([again.anna.inboxId])])
    await again.levi.engine.publishShares()
    await again.anna.engine.sync()
    again.advance(5 * 24 * HOUR)
    await again.anna.engine.sync()
    expect(again.anna.store.getState().incomingShares).toEqual({})
    expect(
      again.anna.store.getState().notifications.some((n) => n.shareKey)
    ).toBe(false)
  })

  it('wipes lapsed invitations offline, without a sync', async () => {
    const { levi, anna, offlineOps, advance } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()

    offlineOps.add('inbox/sync')
    advance(5 * 24 * HOUR)
    await expect(anna.engine.sync()).rejects.toThrow()
    expect(anna.store.getState().incomingShares).toEqual({})
    expect(anna.store.getState().notifications.some((n) => n.shareKey)).toBe(
      false
    )
  })

  it('keeps an answer given offline and sends it once back online', async () => {
    const { levi, anna, offlineOps, advance } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const key = Object.keys(anna.store.getState().incomingShares)[0]
    await anna.engine.replyToShare(key, 'going')

    offlineOps.add('event/put')
    advance(60_000)
    await anna.engine.replyToShare(key, 'declined')
    expect(anna.store.getState().incomingShares[key]).toMatchObject({
      status: 'declined',
      unsentReplyRev: expect.any(Number),
    })

    offlineOps.clear()
    await anna.engine.sync()
    expect(
      anna.store.getState().incomingShares[key].unsentReplyRev
    ).toBeUndefined()
    await levi.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    expect(levi.store.getState().shareReplies[shareId]).toMatchObject({
      [anna.inboxId]: { status: 'declined' },
    })
  })

  it('pushes a change only when the day, time, length, or place moves', async () => {
    const { fake, levi, anna, advance } = await trio()
    const planPushes = () =>
      fake.pushes
        .filter((p) => p.inboxId === anna.inboxId && p.kind.startsWith('plan.'))
        .map((p) => p.kind)
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    expect(planPushes()).toEqual(['plan.invite'])

    advance(60_000)
    const reworded = { ...saturday, note: 'Bring water too' }
    levi.setShares([planSpec([anna.inboxId], reworded)])
    await levi.engine.publishShares()
    expect(planPushes()).toEqual(['plan.invite'])
    await anna.engine.sync()

    const [share] = Object.values(anna.store.getState().incomingShares)
    expect(share.details.note).toBe('Bring water too')
    expect(anna.store.getState().notifications[0].kind).toBe('shareInvite')

    advance(60_000)
    levi.setShares([
      planSpec([anna.inboxId], {
        ...reworded,
        location: { name: 'Park', address: '2 Elm St' },
      }),
    ])
    await levi.engine.publishShares()
    expect(planPushes()).toEqual(['plan.invite', 'plan.update'])
  })

  it('holds share events to an hourly budget so Buddy Cards get through', async () => {
    const { fake, levi, anna, advance } = await trio()
    const planEvents = () =>
      fake.inboxes
        .get(anna.inboxId)!
        .events.filter((event) => event.kind.startsWith('plan.'))
    for (let edit = 0; edit < 40; edit++) {
      levi.setShares([
        planSpec([anna.inboxId], { ...saturday, note: `Edit ${edit}` }),
      ])
      await levi.engine.publishShares()
      advance(60_000)
    }
    expect(planEvents()).toHaveLength(30)

    levi.profile.name = 'Levi W'
    await levi.engine.publishCards()
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].name).toBe('Levi W')

    advance(HOUR)
    await levi.engine.publishShares()
    await anna.engine.sync()
    const [share] = Object.values(anna.store.getState().incomingShares)
    expect(share.details.note).toBe('Edit 39')
  })

  it('shortens a long note to fit the relay event cap', async () => {
    const { levi, anna } = await trio()

    const note = '\u0001'.repeat(2000)
    levi.setShares([planSpec([anna.inboxId], { ...saturday, note })])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const [share] = Object.values(anna.store.getState().incomingShares)
    expect(share.details.title).toBe(saturday.title)
    expect(share.details.note!.length).toBeGreaterThan(1000)
    expect(share.details.note!.length).toBeLessThan(2000)
  })

  it('alerts only devices that registered a template for the kind', async () => {
    const { fake, levi, anna, advance } = await trio()
    expect(BUDDY_PUSH_KINDS.length).toBeLessThanOrEqual(32)
    const templates = Object.fromEntries(
      BUDDY_PUSH_KINDS.map((kind) => [kind, { title: kind, body: kind }])
    )
    const device = { apnsToken: 'ab', apnsEnvironment: 'sandbox' as const }
    await anna.engine.registerPush({ ...device, templates })
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    expect(fake.alerts.map((alert) => alert.kind)).toEqual(['plan.invite'])

    await anna.engine.registerPush({ ...device, templates: {} })
    advance(60_000)
    levi.setShares([])
    await levi.engine.publishShares()
    expect(fake.pushes.at(-1)).toEqual({
      inboxId: anna.inboxId,
      kind: 'plan.cancel',
    })
    expect(fake.alerts).toHaveLength(1)
  })

  it('wipes shares and the queue on delete-all but keeps device choices', async () => {
    const { levi, anna } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const key = Object.keys(anna.store.getState().incomingShares)[0]
    await anna.engine.replyToShare(key, 'going')
    await levi.engine.sync()
    const shareId = levi.engine.shareIdForKey(planShareKey('sat'))
    expect(levi.store.getState().shareReplies[shareId]).toHaveProperty(
      anna.inboxId
    )

    anna.store.setState({ notificationsEnabled: false, devOverride: true })
    await anna.engine.deleteEverything()
    expect(anna.store.getState()).toMatchObject({
      incomingShares: {},
      outgoingShares: {},
      shareReplies: {},
      notifications: [],
      notificationsEnabled: false,
      devOverride: true,
      onboardingComplete: true,
    })

    await levi.engine.sync()
    expect(
      levi.store.getState().shareReplies[shareId]?.[anna.inboxId]
    ).toBeUndefined()
    expect(
      levi.store.getState().outgoingShares[planShareKey('sat')].sent
    ).not.toHaveProperty(anna.inboxId)
    expect(
      levi.store.getState().notifications.some((n) => n.from === anna.inboxId)
    ).toBe(false)
  })

  it('sends no share without a name to show it under', async () => {
    const { fake, levi, anna } = await trio()
    levi.profile.name = ' '
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    expect(fake.pushes.some((p) => p.kind === 'plan.invite')).toBe(false)
  })

  it('keeps a pending invitation in the queue until it is answered', async () => {
    const { levi, anna } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const entry = anna.store
      .getState()
      .notifications.find((n) => n.kind === 'shareInvite')!

    anna.engine.dismissNotification(entry.id)
    await anna.engine.sync()
    expect(
      anna.store.getState().notifications.some((n) => n.id === entry.id)
    ).toBe(true)

    await anna.engine.replyToShare(entry.shareKey!, 'declined')
    anna.engine.dismissNotification(entry.id)
    expect(
      anna.store.getState().notifications.some((n) => n.id === entry.id)
    ).toBe(false)
  })

  it('lists a pending invitation again when its entry was lost', async () => {
    const { levi, anna } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const key = Object.keys(anna.store.getState().incomingShares)[0]

    anna.store.setState((state) => ({
      notifications: state.notifications.filter((n) => n.shareKey !== key),
    }))
    await anna.engine.sync()
    expect(
      anna.store.getState().notifications.find((n) => n.shareKey === key)
    ).toMatchObject({ kind: 'shareInvite', name: 'Levi', read: false })

    await anna.engine.replyToShare(key, 'going')
    anna.store.setState({ notifications: [] })
    anna.engine.expire()
    expect(anna.store.getState().notifications).toEqual([])
  })

  it('never evicts a pending invitation from a full queue', async () => {
    const { levi, anna, advance } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const key = Object.keys(anna.store.getState().incomingShares)[0]
    const at = anna.store.getState().notifications[0].at

    const filler = Array.from({ length: MAX_NOTIFICATIONS }, (_, i) => ({
      id: `filler-${i}`,
      kind: 'paired' as const,
      at: at + MAX_NOTIFICATIONS - i,
      read: true,
      from: levi.inboxId,
      name: 'Levi',
    }))
    anna.store.setState((state) => ({
      notifications: [...filler, ...state.notifications],
    }))

    advance(60_000)
    levi.setShares([
      planSpec([anna.inboxId]),
      { ...planSpec([anna.inboxId]), key: planShareKey('sun') },
    ])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const { notifications } = anna.store.getState()
    expect(notifications).toHaveLength(MAX_NOTIFICATIONS)
    expect(notifications.filter((n) => n.kind === 'shareInvite')).toHaveLength(
      2
    )
    expect(notifications.some((n) => n.shareKey === key)).toBe(true)
  })

  it('reads a change to an invitation seen in the tray as a change', async () => {
    const { levi, anna, advance } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const [invite] = anna.store.getState().notifications
    expect(invite.kind).toBe('shareInvite')

    anna.engine.markNotificationRead(invite.id)
    advance(60_000)
    levi.setShares([planSpec([anna.inboxId], { ...saturday, s: 660 })])
    await levi.engine.publishShares()
    await anna.engine.sync()
    expect(anna.store.getState().notifications[0].kind).toBe('shareUpdate')
  })

  it('finds the queue entry a push announced by its event sequence', async () => {
    const { fake, levi, anna } = await trio()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const event = fake.inboxes
      .get(anna.inboxId)!
      .events.find((e) => e.kind === 'plan.invite')!
    const { notifications } = anna.store.getState()
    expect(notifications.find((n) => n.seq === event.seq)?.id).toBe(
      event.eventId
    )
  })

  it('re-sends an unchanged push registration once a day', async () => {
    const { fake, anna, advance, offlineOps } = await trio()
    const device = {
      apnsToken: 'ab',
      apnsEnvironment: 'sandbox' as const,
      apnsTopic: 'com.leviwilkerson.jwtimebeta',
      templates: { 'plan.invite': { title: 'Invite', body: 'Invite' } },
    }
    expect(await anna.engine.registerPush(device)).toBe('registered')
    const { deviceId } = anna.store.getState()
    const devices = fake.inboxes.get(anna.inboxId)!.devices
    expect(devices.get(deviceId!)).toMatchObject({
      apnsTopic: 'com.leviwilkerson.jwtimebeta',
    })

    devices.delete(deviceId!)
    expect(await anna.engine.registerPush(device)).toBe('unchanged')
    advance(PUSH_REGISTRATION_REFRESH_MS)
    expect(await anna.engine.registerPush(device)).toBe('refreshed')
    expect(devices.has(deviceId!)).toBe(true)

    expect(
      await anna.engine.registerPush({
        ...device,
        apnsTopic: 'com.leviwilkerson.jwtime',
      })
    ).toBe('registered')

    offlineOps.add('device/register')
    await expect(anna.engine.registerPush(device)).rejects.toThrow()
    expect(anna.store.getState().pushRegistrationKey).toBeNull()
    offlineOps.clear()
    expect(await anna.engine.registerPush(device)).toBe('registered')
  })

  it('queues claims until they are answered', async () => {
    const { user } = setup()
    const levi = user('Levi')
    const anna = user('Anna')
    const link = await levi.engine.createInvite()
    await anna.engine.acceptInvite(link)
    await levi.engine.sync()
    expect(levi.store.getState().notifications[0]).toMatchObject({
      kind: 'claim',
      name: 'Anna',
    })
    const [claim] = levi.store.getState().incomingClaims
    await levi.engine.confirmClaim(claim.inviteId)
    expect(levi.store.getState().notifications).toEqual([])
    await anna.engine.sync()
    expect(anna.store.getState().notifications[0]).toMatchObject({
      kind: 'paired',
      name: 'Levi',
    })
    anna.engine.markNotificationsRead()
    expect(anna.store.getState().notifications[0].read).toBe(true)
  })
})

describe('buildOutgoingShares', () => {
  const now = Date.parse('2026-09-23T15:00:00Z')
  const contact = {
    id: 'c1',
    name: 'Maria  Lopez',
    phone: '555-0100',
    address: { line1: '12 Oak St', city: 'Springfield', zip: '12345' },
    coordinate: { latitude: 1, longitude: 2 },
    createdAt: new Date(now),
  } as Contact

  it('shares only minimal householder details for a Follow-up', () => {
    const details = followUpShareDetails(
      {
        date: new Date(2026, 8, 26, 10, 30),
        notifyMe: false,
        topic: 'x'.repeat(100),
        buddies: ['b'],
      },
      contact
    )
    expect(details).toEqual({
      d: '2026-09-26',
      s: 630,
      firstName: 'Maria',
      location: {
        address: '12 Oak St, Springfield',
        latitude: 1,
        longitude: 2,
      },
      topic: 'x'.repeat(80),
    })
  })

  it('skips Plans over a month past, and dismissed, linked, and uninvited items', () => {
    const visit = (id: string, followUp: Partial<Visit['followUp']>): Visit =>
      ({
        id,
        contact: { id: 'c1' },
        date: new Date(now),
        isBibleStudy: false,
        followUp: {
          date: new Date(now + 24 * 60 * 60 * 1000),
          notifyMe: false,
          ...followUp,
        },
      }) as Visit
    const specs = buildOutgoingShares({
      now,
      contacts: [contact],
      dayPlans: [
        { ...dayPlan('2026-09-26', 60), id: 'shared', buddies: ['b'] },
        { ...dayPlan('2026-09-20', 60), id: 'lastWeek', buddies: ['b'] },
        { ...dayPlan('2026-08-20', 60), id: 'past', buddies: ['b'] },
        { ...dayPlan('2026-09-26', 60), id: 'solo' },
        {
          ...dayPlan('2026-09-26', 60),
          id: 'linked',
          buddies: ['b'],
          buddyShare: { from: 'x', shareId: 'y' },
        },
      ],
      visits: [
        visit('v1', { buddies: ['b'] }),
        visit('v2', { buddies: ['b'], dismissed: true }),
        visit('v3', {}),
      ],
    })
    expect(specs.map((spec) => spec.key)).toEqual([
      'plan:shared',
      'plan:lastWeek',
      'followUp:v1',
    ])
  })
})

describe('reconcileLinkedPlans', () => {
  const now = Date.parse('2026-09-23T15:00:00Z')
  const share = (status: 'pending' | 'going' | 'declined' | 'cancelled') => ({
    from: 'levi',
    shareId: 'share-1',
    type: 'plan' as const,
    rev: 1,
    details: { d: '2026-09-26', s: 600, m: 90, title: 'Cart' },
    expiresAt: 0,
    receivedAt: 0,
    status,
  })

  it('adds, follows, and removes the Plan a "Going" answer creates', () => {
    const added = reconcileLinkedPlans([], [share('going')], { now })
    expect(added.add).toEqual([
      expect.objectContaining({
        id: linkedPlanId({ from: 'levi', shareId: 'share-1' }),
        minutes: 90,
        startTimeInMinutes: 600,
        title: 'Cart',
        buddyShare: { from: 'levi', shareId: 'share-1', rev: 1 },
      }),
    ])
    const plan = added.add[0]
    expect(reconcileLinkedPlans([plan], [share('going')], { now })).toEqual({
      add: [],
      update: [],
      remove: [],
    })
    const moved = {
      ...share('going'),
      details: { ...share('going').details, m: 120 },
    }
    expect(
      reconcileLinkedPlans([plan], [moved], { now }).update[0]
    ).toMatchObject({
      id: plan.id,
      minutes: 120,
    })
    expect(
      reconcileLinkedPlans([plan], [share('cancelled')], { now }).remove
    ).toEqual([plan.id])
    expect(reconcileLinkedPlans([], [share('pending')], { now }).add).toEqual(
      []
    )
    expect(effectiveShareStatus(share('pending'), [plan])).toBe('going')
  })

  it("never puts back details a device that's behind has", () => {
    const plan = reconcileLinkedPlans([], [share('going')], { now }).add[0]
    const renamed = {
      ...share('going'),
      rev: 2,
      details: { ...share('going').details, title: 'Cart :)' },
    }

    const onPhone = {
      ...plan,
      ...reconcileLinkedPlans([plan], [renamed], { now }).update[0],
    }
    expect(onPhone).toMatchObject({
      title: 'Cart :)',
      buddyShare: { rev: 2 },
    })

    expect(reconcileLinkedPlans([onPhone], [share('going')], { now })).toEqual({
      add: [],
      update: [],
      remove: [],
    })

    expect(reconcileLinkedPlans([onPhone], [renamed], { now }).update).toEqual(
      []
    )
  })

  it('gives back the details an older copy brought back', () => {
    const plan = reconcileLinkedPlans([], [share('going')], { now }).add[0]

    const edited = { ...plan, title: 'My carts' }
    expect(
      reconcileLinkedPlans([edited], [share('going')], { now }).update[0]
    ).toMatchObject({ id: plan.id, title: 'Cart' })

    const { rev: _rev, ...unstamped } = plan.buddyShare!
    expect(
      reconcileLinkedPlans(
        [{ ...plan, buddyShare: unstamped }],
        [share('going')],
        {
          now,
        }
      ).update[0]
    ).toMatchObject({ buddyShare: { rev: 1 } })
  })

  it("keeps the User's own hours through the organizer's changes", () => {
    const plan = reconcileLinkedPlans([], [share('going')], { now }).add[0]
    const ownHours = {
      ...plan,
      minutes: 60,
      categoryId: 'ldc',
      notifyMe: true,
      buddyShare: { ...plan.buddyShare!, ownMinutes: true as const },
    }
    expect(
      reconcileLinkedPlans([ownHours], [share('going')], { now }).update
    ).toEqual([])
    const changed = {
      ...share('going'),
      rev: 2,
      details: { ...share('going').details, s: 660, m: 180 },
    }
    const [update] = reconcileLinkedPlans([ownHours], [changed], {
      now,
    }).update
    expect(update).toMatchObject({
      startTimeInMinutes: 660,
      buddyShare: { rev: 2, ownMinutes: true },
    })

    expect(update).not.toHaveProperty('minutes')
    expect(update).not.toHaveProperty('categoryId')
    expect(update).not.toHaveProperty('notifyMe')
  })

  it('gives the Plan the same id on every device that answers "Going"', () => {
    const onPhone = reconcileLinkedPlans([], [share('going')], { now }).add[0]
    const onIpad = reconcileLinkedPlans([], [share('going')], { now }).add[0]

    expect(onPhone.id).toBe(onIpad.id)
    expect(onPhone.id).not.toBe(
      reconcileLinkedPlans([], [{ ...share('going'), shareId: 'share-2' }], {
        now,
      }).add[0].id
    )
  })

  it('gives linked Plans ids that pass sync validation', () => {
    const id = linkedPlanId({
      from: 'AbC-_0123456789abcdefg',
      shareId: 'zYx_-9876543210ZYXWVUt',
    })

    expect(id).toBe('buddy.AbC-_0123456789abcdefg.zYx_-9876543210ZYXWVUt')
    expect(id).not.toMatch(/\/|\\|\.\./)
  })

  it('keeps the same copy on every device when duplicates meet', () => {
    const linked = (id: string): DayPlan => ({
      ...reconcileLinkedPlans([], [share('going')], { now }).add[0],
      id,
    })

    const phoneCopy = linked('b-from-phone')
    const ipadCopy = linked('a-from-ipad')
    const removedFrom = (dayPlans: DayPlan[]) =>
      reconcileLinkedPlans(dayPlans, [share('going')], { now }).remove

    expect(removedFrom([phoneCopy, ipadCopy])).toEqual(['b-from-phone'])
    expect(removedFrom([ipadCopy, phoneCopy])).toEqual(['b-from-phone'])

    const shared = linked(linkedPlanId({ from: 'levi', shareId: 'share-1' }))
    expect(removedFrom([ipadCopy, shared, phoneCopy])).toEqual([
      'a-from-ipad',
      'b-from-phone',
    ])
    expect(removedFrom([shared, phoneCopy, ipadCopy])).toEqual([
      'a-from-ipad',
      'b-from-phone',
    ])
  })

  it('declines only once no Plan follows the invitation', () => {
    const plan = (id: string, shareId = 'share-1'): DayPlan => ({
      ...dayPlan('2026-09-26', 60),
      id,
      buddyShare: { from: 'levi', shareId },
    })
    const key = incomingShareKey('levi', 'share-1')

    expect(sharesLeftUnlinked([plan('a'), plan('b')], [plan('a')])).toEqual([])
    expect(sharesLeftUnlinked([plan('a')], [])).toEqual([key])
    expect(sharesLeftUnlinked([plan('a'), plan('b')], [])).toEqual([key])

    expect(
      sharesLeftUnlinked([plan('a')], [{ ...plan('a'), buddyShare: undefined }])
    ).toEqual([])
    expect(
      sharesLeftUnlinked([plan('a'), plan('c', 'share-2')], [plan('a')])
    ).toEqual([incomingShareKey('levi', 'share-2')])
  })

  it("doesn't bring back a Plan deleted on another device", () => {
    const id = linkedPlanId({ from: 'levi', shareId: 'share-1' })
    const key = incomingShareKey('levi', 'share-1')
    const deletedPlanIds = new Set([id])

    expect(
      reconcileLinkedPlans([], [share('going')], { now, deletedPlanIds }).add
    ).toEqual([])

    expect(
      reconcileLinkedPlans([], [share('going')], {
        now,
        deletedPlanIds,
        answered: new Set([key]),
      }).add.map((plan) => plan.id)
    ).toEqual([id])

    expect(
      reconcileLinkedPlans([], [{ ...share('going'), shareId: 'share-2' }], {
        now,
        deletedPlanIds,
      }).add
    ).toHaveLength(1)
  })

  it('treats only a fresh "Going" answer as answered', () => {
    const key = incomingShareKey('levi', 'share-1')
    const at = (
      status: 'pending' | 'going' | 'declined',
      unsentReplyRev?: number
    ) => ({ [key]: { ...share('going'), status, unsentReplyRev } })

    expect(sharesJustAccepted(at('pending'), at('going', 5))).toEqual(
      new Set([key])
    )
    expect(sharesJustAccepted(at('going', 5), at('going', 9))).toEqual(
      new Set([key])
    )

    expect(sharesJustAccepted(at('going', 5), at('going'))).toEqual(new Set())
    expect(sharesJustAccepted(at('going', 5), at('going', 5))).toEqual(
      new Set()
    )
    expect(sharesJustAccepted(at('going', 5), at('declined', 9))).toEqual(
      new Set()
    )
  })

  it('takes buddies who are gone off Plans and Follow-ups', () => {
    const followUp = { date: new Date(0), notifyMe: false }
    const changes = forgetBuddiesInData(
      [
        { ...dayPlan('2026-09-26', 60), id: 'mine', buddies: ['gone', 'kept'] },
        {
          ...dayPlan('2026-09-26', 60),
          id: 'theirs',
          buddyShare: { from: 'gone', shareId: 's' },
        },
        { ...dayPlan('2026-09-26', 60), id: 'other', buddies: ['kept'] },
      ],
      [
        { id: 'v1', followUp: { ...followUp, buddies: ['gone'] } },
        { id: 'v2', followUp: { ...followUp, buddies: ['kept'] } },
      ] as Visit[],
      new Set(['gone'])
    )
    expect(changes.dayPlans).toEqual([
      { id: 'mine', buddies: ['kept'] },
      { id: 'theirs', buddyShare: undefined },
    ])
    expect(changes.dayPlans[1]).toHaveProperty('buddyShare')
    expect(changes.visits).toEqual([
      { id: 'v1', followUp: { ...followUp, buddies: undefined } },
    ])
  })
})

describe('asking to join', () => {
  const HOUR = 60 * 60 * 1000
  const saturday = '2026-09-26'
  const sunday = '2026-09-27'
  const nine = { s: 540, m: 120 }

  const startsAt = new Date(`${saturday}T09:00:00`).getTime()
  const device = { apnsToken: 'ab', apnsEnvironment: 'sandbox' as const }
  const template = { title: 't', body: 'b' }
  const isJoinAlert = (alert: { kind: string }) =>
    alert.kind.startsWith('join.')

  type User = { store: { getState: () => BuddiesState } }
  const requestsOf = (user: User) =>
    Object.values(user.store.getState().joinRequests)
  const askedOf = (user: User) =>
    Object.values(user.store.getState().askedToJoin)

  const joinEntries = (user: User) =>
    user.store
      .getState()
      .notifications.filter((entry) => entry.kind === 'joinRequest')

  async function duo(annaPlans?: Plans) {
    const env = setup()
    const levi = env.user('Levi')
    const anna = env.user('Anna', annaPlans)
    await pair(levi, anna)
    const registerAnna = async () =>
      anna.engine.registerPush({
        ...device,
        templates: Object.fromEntries(
          (await anna.engine.joinRequestPushKinds()).map((kind) => [
            kind,
            template,
          ])
        ),
      })
    await registerAnna()
    const joinEventsTo = (inboxId: string) =>
      env.fake.inboxes
        .get(inboxId)!
        .events.filter((event) => event.kind.startsWith('join.'))
    return { ...env, levi, anna, registerAnna, joinEventsTo }
  }

  it('asks once, and the buddy is alerted and sees it in the tray', async () => {
    const { fake, levi, anna } = await duo()
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    expect(fake.alerts.filter(isJoinAlert)).toHaveLength(1)
    expect(askedOf(levi)).toMatchObject([
      { to: anna.inboxId, d: saturday, ...nine, attempted: true, pushed: true },
    ])
    expect(askedOf(levi)[0].sentRev).toBe(askedOf(levi)[0].rev)

    await anna.engine.sync()
    expect(requestsOf(anna)).toMatchObject([
      { from: levi.inboxId, d: saturday, ...nine },
    ])
    expect(joinEntries(anna)).toMatchObject([
      { kind: 'joinRequest', name: 'Levi', read: false },
    ])
  })

  it('gives each buddy their own alert kind', async () => {
    const env = setup()
    const anna = env.user('Anna')
    await pair(env.user('Levi'), anna)
    await pair(env.user('Mom'), anna)
    const kinds = await anna.engine.joinRequestPushKinds()
    expect(new Set(kinds).size).toBe(2)
    for (const kind of kinds) expect(kind).toMatch(/^join\.request\.[0-9a-f]+$/)
    expect(kinds[0].length).toBeLessThanOrEqual(40)
  })

  it('sends one request when asked twice at once', async () => {
    const { levi, anna, joinEventsTo } = await duo()
    await Promise.all([
      levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt),
      levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt),
      levi.engine.sync(),
    ])
    expect(joinEventsTo(anna.inboxId)).toHaveLength(1)
  })

  it('lets Not Now pass quietly: the asker hears nothing, and asking again neither alerts nor lists it', async () => {
    const { fake, levi, anna, advance, joinEventsTo } = await duo()
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    await anna.engine.sync()
    anna.engine.dismissNotification(joinEntries(anna)[0].id)
    expect(joinEntries(anna)).toEqual([])

    await anna.engine.sync()
    await levi.engine.sync()
    expect(joinEventsTo(levi.inboxId)).toEqual([])
    expect(askedOf(levi)[0].withdrawn).toBeFalsy()

    const [request] = askedOf(levi)
    await levi.engine.withdrawJoinRequest(request.id)
    advance(2 * 60_000)
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    expect(fake.alerts.filter(isJoinAlert)).toHaveLength(1)
    await anna.engine.sync()
    expect(joinEntries(anna)).toEqual([])
  })

  it('takes a withdrawn request out of the buddy’s tray without an alert, and asking again stays quiet', async () => {
    const { fake, levi, anna, advance } = await duo()
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    await anna.engine.sync()
    const [request] = askedOf(levi)
    await levi.engine.withdrawJoinRequest(request.id)
    expect(askedOf(levi)).toMatchObject([{ withdrawn: true }])

    await anna.engine.sync()
    expect(requestsOf(anna)).toMatchObject([{ withdrawn: true }])
    expect(joinEntries(anna)).toEqual([])

    advance(2 * 60_000)
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    expect(fake.alerts.filter(isJoinAlert)).toHaveLength(1)
    await anna.engine.sync()

    expect(requestsOf(anna)).toHaveLength(1)
    expect(requestsOf(anna)[0].withdrawn).toBeFalsy()
    expect(joinEntries(anna)).toMatchObject([{ read: true }])
  })

  it('withdraws a request whose send seemed to fail, in case it landed', async () => {
    const { offlineOps, levi, anna, joinEventsTo } = await duo()
    offlineOps.add('event/put')
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    const [request] = askedOf(levi)
    expect(request.attempted).toBe(true)
    expect(request.sentRev).toBeUndefined()
    await levi.engine.withdrawJoinRequest(request.id)
    offlineOps.clear()
    await levi.engine.sync()
    expect(joinEventsTo(anna.inboxId).map((event) => event.kind)).toEqual([
      'join.cancel',
    ])
  })

  it('keeps a request asked offline and alerts once it goes out', async () => {
    const { fake, offlineOps, levi, anna } = await duo()
    offlineOps.add('event/put')
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    offlineOps.clear()
    await levi.engine.sync()
    await levi.engine.sync()
    expect(fake.alerts.filter(isJoinAlert)).toHaveLength(1)
    await anna.engine.sync()
    expect(requestsOf(anna)).toHaveLength(1)
    expect(joinEntries(anna)).toMatchObject([{ read: false }])
  })

  it('takes back a request still unsent once the Plan is too close', async () => {
    const { fake, offlineOps, levi, anna, advance, joinEventsTo } = await duo()
    offlineOps.add('event/put')
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    offlineOps.clear()
    advance(startsAt - Date.parse('2026-09-23T15:00:00Z') - HOUR)
    await levi.engine.sync()
    expect(askedOf(levi)).toMatchObject([{ withdrawn: true }])

    expect(joinEventsTo(anna.inboxId).map((event) => event.kind)).toEqual([
      'join.cancel',
    ])
    expect(fake.alerts.filter(isJoinAlert)).toEqual([])
  })

  it('alerts a buddy for at most three requests a day', async () => {
    const { fake, levi, anna, advance } = await duo()
    for (const d of ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29']) {
      await levi.engine.askToJoin(
        anna.inboxId,
        d,
        nine,
        startsAt + 4 * 24 * HOUR
      )
      const [open] = askedOf(levi).filter((request) => !request.withdrawn)
      await levi.engine.withdrawJoinRequest(open.id)
      advance(2 * 60_000)
    }
    expect(fake.alerts.filter(isJoinAlert)).toHaveLength(3)
  })

  it('treats inviting the buddy that day as the answer, on both phones', async () => {
    const { levi, anna } = await duo()
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    await levi.engine.askToJoin(
      anna.inboxId,
      sunday,
      nine,
      startsAt + 24 * HOUR
    )
    await anna.engine.sync()
    expect(requestsOf(anna)).toHaveLength(2)

    anna.setShares([
      {
        key: planShareKey('sat'),
        type: 'plan',
        details: { d: saturday, ...nine },
        recipients: [levi.inboxId],
        endsAt: startsAt + HOUR,
        expiresAt: startsAt + 3 * HOUR,
      },
    ])
    await anna.engine.publishShares()
    expect(requestsOf(anna)).toMatchObject([{ d: sunday }])
    expect(joinEntries(anna)).toHaveLength(1)

    await levi.engine.sync()
    expect(askedOf(levi)).toMatchObject([{ d: sunday }])
    expect(levi.store.getState().notifications[0]).toMatchObject({
      kind: 'shareInvite',
      name: 'Anna',
    })
  })

  it('takes a request back when the buddy moves or drops that Plan', async () => {
    const annaPlans: Plans = {
      dayPlans: [dayPlan(`${saturday}T12:00:00`, 120, 540)],
      recurringPlans: [],
    }
    const { levi, anna, joinEventsTo } = await duo(annaPlans)
    await anna.engine.publishCards()
    await levi.engine.sync()
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)

    annaPlans.dayPlans = [dayPlan(`${saturday}T12:00:00`, 120, 600)]
    await anna.engine.publishCards()
    await levi.engine.sync()
    expect(askedOf(levi)).toMatchObject([{ withdrawn: true }])
    expect(joinEventsTo(anna.inboxId).map((event) => event.kind)).toContain(
      'join.cancel'
    )
    await anna.engine.sync()
    expect(requestsOf(anna)).toMatchObject([{ withdrawn: true }])
    expect(joinEntries(anna)).toEqual([])
  })

  it('stops alerting for a muted buddy or with Ask to Join alerts off, and lists theirs as read', async () => {
    const { fake, levi, anna, registerAnna, advance } = await duo()
    anna.engine.setBuddyAlert(levi.inboxId, 'joinRequests', false)
    expect(await anna.engine.joinRequestPushKinds()).toEqual([])
    advance(PUSH_REGISTRATION_REFRESH_MS)
    await registerAnna()
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    expect(fake.alerts.filter(isJoinAlert)).toEqual([])
    await anna.engine.sync()
    expect(requestsOf(anna)).toHaveLength(1)
    expect(joinEntries(anna)).toMatchObject([{ read: true }])

    anna.engine.setBuddyAlert(levi.inboxId, 'joinRequests', undefined)
    anna.store.setState({ joinRequestNotifications: false })
    expect(await anna.engine.joinRequestPushKinds()).toEqual([])

    anna.engine.setBuddyAlert(levi.inboxId, 'joinRequests', true)
    expect(await anna.engine.joinRequestPushKinds()).toHaveLength(1)
  })

  it('closes asking two hours before the start and caps open requests per buddy', async () => {
    const { levi, anna, advance } = await duo()
    advance(startsAt - Date.parse('2026-09-23T15:00:00Z') - HOUR)
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    expect(askedOf(levi)).toEqual([])

    for (const [index, d] of [
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
    ].entries())
      await levi.engine.askToJoin(
        anna.inboxId,
        d,
        nine,
        startsAt + (index + 2) * 24 * HOUR
      )
    expect(askedOf(levi)).toHaveLength(3)
  })

  it('holds a request to the Plan’s own start and the Buddy Card’s window', async () => {
    const { levi, anna } = await duo()
    await levi.engine.askToJoin(
      anna.inboxId,
      saturday,
      nine,
      startsAt + 30 * 24 * HOUR
    )
    await levi.engine.askToJoin(
      anna.inboxId,
      '2026-12-31',
      nine,
      Date.parse('2027-01-01')
    )
    await anna.engine.sync()
    expect(requestsOf(anna)).toHaveLength(1)
    expect(requestsOf(anna)[0].expiresAt).toBeLessThanOrEqual(
      startsAt + 24 * HOUR
    )
  })

  it('lets requests lapse on both phones when the Plan starts, offline', async () => {
    const { levi, anna, advance } = await duo()
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    await anna.engine.sync()
    advance(startsAt - Date.parse('2026-09-23T15:00:00Z'))
    levi.engine.expire()
    anna.engine.expire()
    expect(levi.store.getState().askedToJoin).toEqual({})
    expect(anna.store.getState().joinRequests).toEqual({})
    expect(joinEntries(anna)).toEqual([])
  })

  it('forgets requests both ways when the pairing ends', async () => {
    const { levi, anna } = await duo()
    await levi.engine.askToJoin(anna.inboxId, saturday, nine, startsAt)
    await anna.engine.sync()
    await anna.engine.removeBuddy(levi.inboxId)
    expect(anna.store.getState().joinRequests).toEqual({})
    await levi.engine.sync()
    expect(levi.store.getState().askedToJoin).toEqual({})
  })
})

describe('badges', () => {
  const HOUR = 60 * 60 * 1000

  const SPACING = 65 * 1000
  const START = Date.parse('2026-09-23T15:00:00Z')
  const device = { apnsToken: 'ab', apnsEnvironment: 'sandbox' as const }
  const template = { title: 't', body: 'b' }
  type Env = ReturnType<typeof setup>
  type User = ReturnType<Env['user']>

  const badgeEntries = (user: User) =>
    user.store.getState().notifications.filter((n) => n.kind === 'badge')
  const buddyOf = (user: User, other: User) =>
    user.store.getState().buddies.find((b) => b.inboxId === other.inboxId)!

  async function duo() {
    const env = setup()
    const levi = env.user('Levi')
    const anna = env.user('Anna')
    await pair(levi, anna)
    await anna.engine.registerPush({
      ...device,
      templates: Object.fromEntries(
        anna.engine.badgePushKinds().map((kind) => [kind, template])
      ),
    })

    env.advance(SPACING)
    const badgeEventsTo = (inboxId: string) =>
      env.fake.inboxes
        .get(inboxId)!
        .events.filter((event) => event.kind === BADGE_PUSH_KIND)
    const badgeAlerts = () =>
      env.fake.alerts.filter((alert) => alert.kind === BADGE_PUSH_KIND)
    return { ...env, levi, anna, badgeEventsTo, badgeAlerts }
  }

  function rawWriter(from: User, to: User) {
    const me = deriveIdentity(from.seed)
    const buddy = buddyOf(from, to)
    const { slotId, contentKey, writerSeed } = deriveDirection(
      derivePairSecret(
        me.dhPrivate,
        fromB64u(buddy.dhPub),
        fromB64u(buddy.inviteSecret),
        me.inboxId,
        buddy.inboxId
      ),
      to.inboxId
    )
    const auth = { inboxId: to.inboxId, slotId, writerSeed }
    const sealed = (body: unknown, aad: string) =>
      seal(contentKey, utf8(JSON.stringify(body)), aad, random(12))
    return {
      event: (kind: string, body: unknown) => {
        const eventId = toB64u(random(16))
        return from.relay.putEvent(auth, {
          eventId,
          kind,
          blob: sealed(
            body,
            `ww-buddies/v1/event|${to.inboxId}|${slotId}|${eventId}`
          ),
          push: false,
        })
      },
      card: (body: unknown) =>
        from.relay.putCard(
          auth,
          sealed(body, `ww-buddies/v1/card|${to.inboxId}|${slotId}`)
        ),
    }
  }

  it('shares earned badges on the Buddy Card, republishing only when they change', async () => {
    const { fake, user } = setup()
    const levi = user('Levi')
    const anna = user('Anna')
    levi.profile.badges = [{ c: 'monthsShared', l: 2 }, { c: 'firstBuddy' }]
    await pair(levi, anna)
    expect(buddyOf(anna, levi).badges).toEqual([
      { c: 'monthsShared', l: 2 },
      { c: 'firstBuddy' },
    ])

    const cardSeq = () =>
      [...fake.inboxes.get(anna.inboxId)!.cards.values()][0].seq
    const before = cardSeq()
    await levi.engine.publishCards()
    expect(cardSeq()).toBe(before)
    levi.profile.badges = [{ c: 'monthsShared', l: 3 }, { c: 'firstBuddy' }]
    await levi.engine.publishCards()
    expect(cardSeq()).toBeGreaterThan(before)
    await anna.engine.sync()
    expect(buddyOf(anna, levi).badges).toEqual(levi.profile.badges)

    await anna.engine.setNickname(levi.inboxId, 'L')
    const me = deriveIdentity(anna.seed)
    const roster = JSON.parse(
      new TextDecoder().decode(
        open(
          me.rosterKey,
          fake.inboxes.get(anna.inboxId)!.roster!.blob,
          `ww-buddies/v1/roster|${me.inboxId}`
        )
      )
    )
    expect(roster.buddies[0].nickname).toBe('L')
    expect(roster.buddies[0]).not.toHaveProperty('badges')
  })

  it("reads an older app's card, and drops badges this build can't use without losing the Plans", async () => {
    const env = setup()
    const levi = env.user('Levi')
    const anna = env.user('Anna')
    await pair(levi, anna)

    expect(buddyOf(anna, levi).badges).toEqual([])

    const raw = rawWriter(levi, anna)
    const card = {
      v: 1,
      name: 'Levi',
      updatedAt: 1,
      level: 'daysTimes',
      days: [{ d: '2026-09-28', p: [{ m: 60 }] }],
    }
    await raw.card({
      ...card,
      badges: [
        { c: 'yearRound', l: 2 },
        { c: 'futureBadge', l: 1 },
        { c: 'monthsShared', l: 9 },
        { c: 'firstBuddy', l: 1 },
        'junk',
        { c: 'yearRound', l: 2 },
      ],
    })
    await anna.engine.sync()
    expect(buddyOf(anna, levi).badges).toEqual([{ c: 'yearRound', l: 2 }])

    await raw.card({
      ...card,
      days: [...card.days, { d: '2026-09-29', p: [{ m: 30 }] }],
      badges: Array.from({ length: 41 }, () => ({ c: 'yearRound', l: 1 })),
    })
    await anna.engine.sync()
    expect(buddyOf(anna, levi).badges).toEqual([])
    expect(anna.store.getState().cards[levi.inboxId].days).toHaveLength(2)
  })

  it('withholds badges once switched off, in Buddies or for badges as a whole', async () => {
    const { user } = setup()
    const levi = user('Levi')
    const anna = user('Anna')
    levi.profile.badges = [{ c: 'monthsShared', l: 2 }]
    await pair(levi, anna)
    expect(buddyOf(anna, levi).badges).toHaveLength(1)

    await levi.engine.setSharing({ badges: false })
    await anna.engine.sync()
    expect(buddyOf(anna, levi).badges).toEqual([])

    await levi.engine.setSharing({ badges: true })
    await anna.engine.sync()
    expect(buddyOf(anna, levi).badges).toHaveLength(1)

    levi.setShowBadges(false)
    await levi.engine.publishCards()
    await anna.engine.sync()
    expect(buddyOf(anna, levi).badges).toEqual([])
  })

  it("keeps the badges choice on every device, even through an older app's roster", async () => {
    const env = setup()
    const levi = env.user('Levi')
    const anna = env.user('Anna')
    await pair(levi, anna)
    const levisIpad = env.user('Levi', undefined, levi.seed)
    await levisIpad.engine.sync()

    env.advance(1000)
    await levi.engine.setSharing({ badges: false })
    await levisIpad.engine.sync()
    expect(levisIpad.store.getState().sharing.badges).toBe(false)

    env.advance(1000)
    const roster = {
      v: 1,
      buddies: [],
      outgoingInvites: [],
      incomingClaims: [],
      closedInviteIds: {},
      sharing: { photo: false, tenure: true, updatedAt: START + 5000 },
    }
    expect(rosterSchema.safeParse(roster).success).toBe(true)
    const me = deriveIdentity(levi.seed)
    await levi.relay.putRoster(
      ownerAuthFor(levi.seed),
      seal(
        me.rosterKey,
        utf8(JSON.stringify(roster)),
        `ww-buddies/v1/roster|${me.inboxId}`,
        random(12)
      )
    )
    await levisIpad.engine.sync()
    expect(levisIpad.store.getState().sharing).toMatchObject({
      photo: false,
      badges: false,
    })
    expect(levisIpad.store.getState().buddies).toHaveLength(1)

    await levi.engine.sync()
    expect(levi.store.getState().sharing).toMatchObject({
      photo: false,
      badges: false,
    })
  })

  it('announces new levels in one event per buddy, under an id every device shares', async () => {
    const { levi, anna, user, badgeEventsTo, badgeAlerts } = await duo()
    await levi.engine.announceBadges(['monthsShared.2', 'returnVisits.1'])
    const events = badgeEventsTo(anna.inboxId)
    expect(events).toHaveLength(1)
    expect(events[0].eventId).toBe(
      toB64u(
        sha256(
          utf8(
            `ww-buddies/v1/badge|${levi.inboxId}|${anna.inboxId}|monthsShared.2,returnVisits.1`
          )
        ).slice(0, 16)
      )
    )
    expect(badgeAlerts()).toHaveLength(1)
    expect(levi.store.getState().badgeAnnouncements).toEqual([])

    const levisIpad = user('Levi', undefined, levi.seed)
    await levisIpad.engine.sync()
    await levisIpad.engine.announceBadges(['returnVisits.1', 'monthsShared.2'])
    expect(badgeEventsTo(anna.inboxId)).toHaveLength(1)
    expect(badgeAlerts()).toHaveLength(1)
  })

  it('never announces One-time Badges', async () => {
    const { levi, anna, badgeEventsTo } = await duo()
    await levi.engine.announceBadges(['firstBibleStudy', 'firstBuddy'])
    expect(badgeEventsTo(anna.inboxId)).toEqual([])
    expect(levi.store.getState().badgeAnnouncements).toEqual([])

    await levi.engine.announceBadges(['firstBuddy', 'together.1'])
    await anna.engine.sync()
    expect(badgeEntries(anna)).toMatchObject([
      { badges: [{ c: 'together', l: 1 }] },
    ])
  })

  it('alerts a buddy at most once in 20 hours; later news arrives quietly', async () => {
    const { levi, anna, advance, badgeEventsTo, badgeAlerts } = await duo()
    await levi.engine.announceBadges(['monthsShared.1'])
    advance(HOUR)
    await levi.engine.announceBadges(['prepared.1'])
    expect(badgeEventsTo(anna.inboxId)).toHaveLength(2)
    expect(badgeAlerts()).toHaveLength(1)
    await anna.engine.sync()
    expect(badgeEntries(anna)).toHaveLength(2)

    advance(19 * HOUR)
    await levi.engine.announceBadges(['conversations.1'])
    expect(badgeAlerts()).toHaveLength(2)
  })

  it('tells only buddies paired before the news, retrying until it lands', async () => {
    const env = await duo()
    const { levi, anna, offlineOps, badgeEventsTo, badgeAlerts } = env
    offlineOps.add('event/put')
    await levi.engine.announceBadges(['monthsShared.2'])
    expect(badgeEventsTo(anna.inboxId)).toEqual([])
    expect(levi.store.getState().badgeAnnouncements).toMatchObject([
      { recipients: [anna.inboxId], sent: {} },
    ])

    offlineOps.delete('event/put')
    const mom = env.user('Mom')
    await pair(levi, mom)
    await levi.engine.sync()
    expect(badgeEventsTo(anna.inboxId)).toHaveLength(1)
    expect(badgeEventsTo(mom.inboxId)).toEqual([])

    expect(badgeAlerts()).toHaveLength(1)
    expect(levi.store.getState().badgeAnnouncements).toEqual([])
  })

  it('drops news it could not deliver within a week', async () => {
    const { levi, anna, offlineOps, advance, badgeEventsTo } = await duo()
    offlineOps.add('event/put')
    await levi.engine.announceBadges(['monthsShared.2'])
    advance(8 * 24 * HOUR)
    offlineOps.delete('event/put')
    await levi.engine.sync()
    expect(badgeEventsTo(anna.inboxId)).toEqual([])
    expect(levi.store.getState().badgeAnnouncements).toEqual([])
  })

  it('stays quiet before Buddies starts, with badges off or not shared, and drops unsent news then', async () => {
    const solo = setup()
    const levi1 = solo.user('Levi')
    await levi1.engine.announceBadges(['monthsShared.1'])
    expect(levi1.store.getState().badgeAnnouncements).toEqual([])
    expect(solo.fake.inboxes.size).toBe(0)

    const { levi, anna, offlineOps, badgeEventsTo } = await duo()
    await levi.engine.setSharing({ badges: false })
    await levi.engine.announceBadges(['monthsShared.1'])
    levi.setShowBadges(false)
    await levi.engine.setSharing({ badges: true })
    await levi.engine.announceBadges(['prepared.1'])
    expect(badgeEventsTo(anna.inboxId)).toEqual([])
    expect(levi.store.getState().badgeAnnouncements).toEqual([])

    levi.setShowBadges(true)
    offlineOps.add('event/put')
    await levi.engine.announceBadges(['conversations.1'])
    expect(levi.store.getState().badgeAnnouncements).toHaveLength(1)
    await levi.engine.setSharing({ badges: false })
    expect(levi.store.getState().badgeAnnouncements).toEqual([])
  })

  it("lists a buddy's new badges in the tray and on their page until the next card", async () => {
    const { levi, anna } = await duo()
    levi.profile.badges = [{ c: 'monthsShared', l: 1 }]
    await levi.engine.publishCards()
    await anna.engine.sync()
    await levi.engine.announceBadges(['returnVisits.1', 'monthsShared.2'])
    await anna.engine.sync()
    const news = [
      { c: 'monthsShared', l: 2 },
      { c: 'returnVisits', l: 1 },
    ]
    expect(badgeEntries(anna)).toMatchObject([
      { from: levi.inboxId, name: 'Levi', read: false, badges: news },
    ])
    expect(badgeEntries(anna)[0].seq).toBeGreaterThan(0)
    expect(buddyOf(anna, levi).badges).toEqual(news)

    levi.profile.badges = [{ c: 'returnVisits', l: 1 }]
    await levi.engine.publishCards()
    await anna.engine.sync()
    expect(buddyOf(anna, levi).badges).toEqual([{ c: 'returnVisits', l: 1 }])
  })

  it("drops badges this build doesn't know, and news with none it does", async () => {
    const env = await duo()
    const { levi, anna } = env
    const raw = rawWriter(levi, anna)
    await raw.event(BADGE_PUSH_KIND, {
      v: 1,
      badges: [
        { c: 'futureBadge', l: 1 },
        { c: 'yearRound', l: 2 },
      ],
    })
    await raw.event(BADGE_PUSH_KIND, { v: 1, badges: [{ c: 'futureBadge' }] })
    await raw.event(BADGE_PUSH_KIND, { v: 2, badges: [] })
    await anna.engine.sync()
    expect(badgeEntries(anna)).toMatchObject([
      { badges: [{ c: 'yearRound', l: 2 }] },
    ])
  })

  it('lists news already read with badge alerts off, and not at all with badges off', async () => {
    const { levi, anna, advance } = await duo()
    anna.store.setState({ badgeNotifications: false })
    expect(anna.engine.badgePushKinds()).toEqual([])
    await levi.engine.announceBadges(['monthsShared.1'])
    await anna.engine.sync()
    expect(badgeEntries(anna)).toMatchObject([{ read: true }])

    anna.store.setState({ badgeNotifications: true })
    anna.setShowBadges(false)
    expect(anna.engine.badgePushKinds()).toEqual([])
    advance(HOUR)
    await levi.engine.announceBadges(['prepared.1'])
    await anna.engine.sync()
    expect(badgeEntries(anna)).toHaveLength(1)
    expect(buddyOf(anna, levi).badges).toContainEqual({ c: 'prepared', l: 1 })
  })

  it('lists badge news once, even when a sync reads the inbox from the start', async () => {
    const { levi, anna } = await duo()
    await levi.engine.announceBadges(['monthsShared.1'])
    await anna.engine.sync()
    anna.engine.dismissNotification(badgeEntries(anna)[0].id)
    expect(badgeEntries(anna)).toEqual([])
    anna.store.setState({ syncSeq: 0 })
    await anna.engine.sync()
    expect(badgeEntries(anna)).toEqual([])
  })

  it('merges Plan times and the pause on their own stamp, keeping them through an older app and the more private on a tie', () => {
    const local: BuddySharing = {
      photo: true,
      tenure: true,
      streak: true,
      updatedAt: 10,
      badges: true,
      badgesUpdatedAt: 0,
      pet: true,
      petUpdatedAt: 0,
      plans: true,
      planTimes: 'timeOfDay',
      pausedUntil: 100,
      plansUpdatedAt: 5,
      showOnCalendar: true,
      calendarUpdatedAt: 0,
      petVisits: true,
      petVisitsUpdatedAt: 0,
    }
    const older = { photo: true, tenure: true, streak: true, updatedAt: 20 }

    expect(mergeSharing(local, older)).toMatchObject({
      planTimes: 'timeOfDay',
      pausedUntil: 100,
      plansUpdatedAt: 5,
    })

    expect(
      mergeSharing(local, {
        ...older,
        planTimes: 'exact',
        pausedUntil: 0,
        plansUpdatedAt: 6,
      })
    ).toMatchObject({ planTimes: 'exact', pausedUntil: 0, plansUpdatedAt: 6 })

    expect(
      mergeSharing(local, {
        ...older,
        planTimes: 'daysOnly',
        pausedUntil: 0,
        plansUpdatedAt: 4,
      })
    ).toMatchObject({ planTimes: 'timeOfDay', pausedUntil: 100 })

    expect(
      mergeSharing(local, {
        ...older,
        planTimes: 'daysOnly',
        pausedUntil: 50,
        plansUpdatedAt: 5,
      })
    ).toMatchObject({ planTimes: 'daysOnly', pausedUntil: 100 })

    expect(
      mergeSharing(local, { ...older, plans: false, plansUpdatedAt: 5 })
    ).toMatchObject({ plans: false })
    expect(mergeSharing(local, { ...older, plans: false })).toMatchObject({
      plans: true,
    })

    expect(
      mergeSharing(local, {
        ...older,
        showOnCalendar: false,
        calendarUpdatedAt: 0,
      })
    ).toMatchObject({ showOnCalendar: false })
    expect(
      mergeSharing(local, { ...older, showOnCalendar: false })
    ).toMatchObject({ showOnCalendar: true })
  })

  it('merges the badges choice on its own stamp, keeping it through an older app and withholding on a tie', () => {
    const local: BuddySharing = {
      photo: true,
      tenure: true,
      streak: true,
      updatedAt: 10,
      badges: false,
      badgesUpdatedAt: 5,
      pet: true,
      petUpdatedAt: 0,
      plans: true,
      planTimes: 'exact',
      pausedUntil: 0,
      plansUpdatedAt: 0,
      showOnCalendar: true,
      calendarUpdatedAt: 0,
      petVisits: true,
      petVisitsUpdatedAt: 0,
    }

    expect(
      mergeSharing(local, {
        photo: false,
        tenure: true,
        streak: true,
        updatedAt: 20,
      })
    ).toEqual({ ...local, photo: false, updatedAt: 20 })

    expect(
      mergeSharing(local, {
        photo: true,
        tenure: true,
        streak: false,
        updatedAt: 20,
      })
    ).toMatchObject({ streak: false, badges: false, badgesUpdatedAt: 5 })
    expect(
      mergeSharing(local, {
        photo: true,
        tenure: true,
        streak: false,
        updatedAt: 5,
      })
    ).toMatchObject({ streak: true, updatedAt: 10 })

    const remote = { photo: true, tenure: true, streak: true, updatedAt: 30 }
    expect(
      mergeSharing(local, { ...remote, badges: true, badgesUpdatedAt: 4 })
    ).toMatchObject({ badges: false, badgesUpdatedAt: 5, updatedAt: 30 })
    expect(
      mergeSharing(local, { ...remote, badges: true, badgesUpdatedAt: 6 })
    ).toMatchObject({ badges: true, badgesUpdatedAt: 6 })

    expect(
      mergeSharing(local, { ...remote, badges: true, badgesUpdatedAt: 5 })
    ).toMatchObject({ badges: false, badgesUpdatedAt: 5 })
    expect(
      mergeSharing(
        { ...local, badges: true },
        { ...remote, badges: false, badgesUpdatedAt: 5 }
      )
    ).toMatchObject({ badges: false, badgesUpdatedAt: 5 })
  })

  it("doesn't let an older app's roster bring back badges the User turned off", async () => {
    const env = setup()
    const levi = env.user('Levi')
    const anna = env.user('Anna')
    levi.profile.badges = [{ c: 'monthsShared', l: 2 }]
    await pair(levi, anna)
    const levisMac = env.user('Levi', undefined, levi.seed)
    levisMac.profile.badges = levi.profile.badges
    await levisMac.engine.sync()

    env.advance(1000)
    await levi.engine.setSharing({ badges: false })

    env.advance(1000)
    const me = deriveIdentity(levi.seed)
    await levi.relay.putRoster(
      ownerAuthFor(levi.seed),
      seal(
        me.rosterKey,
        utf8(
          JSON.stringify({
            v: 1,
            buddies: [],
            outgoingInvites: [],
            incomingClaims: [],
            closedInviteIds: {},
            sharing: { photo: false, tenure: true, updatedAt: START + 2000 },
          })
        ),
        `ww-buddies/v1/roster|${me.inboxId}`,
        random(12)
      )
    )

    await levisMac.engine.sync()
    expect(levisMac.store.getState().sharing).toMatchObject({ photo: false })
    await levi.engine.sync()
    expect(levi.store.getState().sharing).toMatchObject({
      photo: false,
      badges: false,
    })
    await levisMac.engine.sync()
    expect(levisMac.store.getState().sharing).toMatchObject({
      photo: false,
      badges: false,
    })
    await anna.engine.sync()
    expect(buddyOf(anna, levi).badges).toEqual([])

    const rosterSeq = () => env.fake.inboxes.get(levi.inboxId)!.roster!.seq
    const settled = rosterSeq()
    await levi.engine.sync()
    await levisMac.engine.sync()
    await levi.engine.sync()
    expect(rosterSeq()).toBe(settled)
  })

  it('settles two devices that chose differently at the same moment, without rewriting forever', async () => {
    const env = setup()
    const levi = env.user('Levi')
    const anna = env.user('Anna')
    await pair(levi, anna)
    const levisMac = env.user('Levi', undefined, levi.seed)
    await levisMac.engine.sync()

    env.advance(1000)
    await levi.engine.setSharing({ badges: false })
    await levisMac.engine.setSharing({ badges: true })
    for (const device of [levi, levisMac, levi, levisMac])
      await device.engine.sync()
    expect(levi.store.getState().sharing.badges).toBe(false)
    expect(levisMac.store.getState().sharing.badges).toBe(false)

    const rosterSeq = () => env.fake.inboxes.get(levi.inboxId)!.roster!.seq
    const settled = rosterSeq()
    for (const device of [levi, levisMac, levi]) await device.engine.sync()
    expect(rosterSeq()).toBe(settled)
  })

  it('makes and sends no badge news while Buddies is hidden or stopped', async () => {
    const { levi, anna, offlineOps, badgeEventsTo } = await duo()
    levi.setEnabled(false)
    await levi.engine.announceBadges(['monthsShared.1'])
    expect(levi.store.getState().badgeAnnouncements).toEqual([])

    levi.setEnabled(true)
    offlineOps.add('event/put')
    await levi.engine.announceBadges(['prepared.1'])
    offlineOps.delete('event/put')
    levi.setEnabled(false)
    await levi.engine.sync()
    expect(badgeEventsTo(anna.inboxId)).toEqual([])
    expect(levi.store.getState().badgeAnnouncements).toHaveLength(1)

    levi.setEnabled(true)
    await levi.engine.sync()
    expect(badgeEventsTo(anna.inboxId)).toHaveLength(1)
  })

  it('waits out the relay’s alert spacing after another alert, instead of losing the badge alert', async () => {
    const { levi, anna, advance, badgeEventsTo, badgeAlerts } = await duo()

    levi.setShares([
      {
        key: planShareKey('sat'),
        type: 'plan',
        details: { d: '2026-09-26', s: 600, m: 120 },
        recipients: [anna.inboxId],
        endsAt: START + 4 * 24 * HOUR,
        expiresAt: START + 5 * 24 * HOUR,
      },
    ])
    await levi.engine.publishShares()
    advance(2000)
    await levi.engine.announceBadges(['together.1'])
    expect(badgeEventsTo(anna.inboxId)).toEqual([])
    expect(levi.store.getState().lastBadgeAlertAt).toEqual({})
    expect(levi.store.getState().badgeAnnouncements).toHaveLength(1)
    expect(levi.timers).toHaveLength(1)
    expect(levi.timers[0].ms).toBe(SPACING - 2000)

    await levi.engine.sync()
    expect(badgeEventsTo(anna.inboxId)).toEqual([])
    expect(levi.timers).toHaveLength(1)

    advance(SPACING)
    levi.timers[0].run()
    await vi.waitFor(() => expect(badgeEventsTo(anna.inboxId)).toHaveLength(1))
    expect(badgeAlerts()).toHaveLength(1)
    expect(levi.store.getState().badgeAnnouncements).toEqual([])
  })

  it('lists badge news when it happened, and old news or a new device’s backlog already read', async () => {
    const { levi, anna, user, advance, fake } = await duo()
    await levi.engine.announceBadges(['monthsShared.1'])
    const [event] = fake.inboxes
      .get(anna.inboxId)!
      .events.filter((e) => e.kind === BADGE_PUSH_KIND)
    advance(HOUR)
    await anna.engine.sync()
    expect(badgeEntries(anna)).toMatchObject([
      { at: event.createdAt, read: false },
    ])

    const annasIpad = user('Anna', undefined, anna.seed)
    await annasIpad.engine.sync()
    expect(badgeEntries(annasIpad)).toMatchObject([
      { at: event.createdAt, read: true },
    ])

    await levi.engine.announceBadges(['prepared.1'])
    advance(25 * HOUR)
    await anna.engine.sync()
    expect(badgeEntries(anna)).toMatchObject([
      { badges: [{ c: 'prepared', l: 1 }], read: true },
      { badges: [{ c: 'monthsShared', l: 1 }], read: false },
    ])
  })

  it('hides listed badge news while badges are off here', () => {
    const entry = (id: string, kind: BuddyNotification['kind']) =>
      ({ id, kind, at: 0, read: false, name: 'Levi' }) as BuddyNotification
    const queue = [entry('a', 'badge'), entry('b', 'paired')]
    expect(listedNotifications(queue, { showBadges: true })).toBe(queue)
    expect(
      listedNotifications(queue, { showBadges: false }).map((n) => n.id)
    ).toEqual(['b'])
  })

  it('drops badge news not yet sent when asked, e.g. once badges are off', async () => {
    const { levi, offlineOps } = await duo()
    offlineOps.add('event/put')
    await levi.engine.announceBadges(['monthsShared.1'])
    expect(levi.store.getState().badgeAnnouncements).toHaveLength(1)
    levi.engine.dropBadgeAnnouncements()
    expect(levi.store.getState().badgeAnnouncements).toEqual([])
  })

  it('keeps the badge alerts choice through delete-all', async () => {
    const { levi, anna } = await duo()
    await levi.engine.announceBadges(['monthsShared.1'])
    await anna.engine.sync()
    anna.store.setState({ badgeNotifications: false })
    await anna.engine.deleteEverything()
    expect(anna.store.getState()).toMatchObject({
      badgeNotifications: false,
      badgeAnnouncements: [],
      seenBadgeEvents: {},
      notifications: [],
    })
  })

  describe('reactions', () => {
    const yearRound = { c: 'yearRound', l: 3 } as const
    const reactionKey = (from: User, to: User, key: string, rev: number) =>
      toB64u(
        sha256(
          utf8(
            `ww-buddies/v1/badge-reaction|${from.inboxId}|${to.inboxId}|${key}|${rev}`
          )
        ).slice(0, 16)
      )

    async function reactionDuo() {
      const env = await duo()
      const { levi, anna } = env
      anna.profile.badges = [yearRound, { c: 'firstBuddy' }]
      levi.profile.badges = [{ c: 'monthsShared', l: 2 }]
      await anna.engine.publishCards()
      await levi.engine.publishCards()
      await levi.engine.sync()
      await anna.engine.sync()
      expect(buddyOf(levi, anna).badges).toEqual(anna.profile.badges)
      const reactionEventsTo = (user: User) =>
        env.fake.inboxes
          .get(user.inboxId)!
          .events.filter((event) => event.kind === BADGE_REACTION_PUSH_KIND)
      const reactionAlerts = () =>
        env.fake.alerts.filter(
          (alert) => alert.kind === BADGE_REACTION_PUSH_KIND
        )
      const reactionEntries = (user: User) =>
        user.store
          .getState()
          .notifications.filter((n) => n.kind === 'badgeReaction')

      const plaintext = (
        from: User,
        to: User,
        event: { eventId: string; blob: string }
      ) => {
        const me = deriveIdentity(from.seed)
        const buddy = buddyOf(from, to)
        const { slotId, contentKey } = deriveDirection(
          derivePairSecret(
            me.dhPrivate,
            fromB64u(buddy.dhPub),
            fromB64u(buddy.inviteSecret),
            me.inboxId,
            buddy.inboxId
          ),
          to.inboxId
        )
        return JSON.parse(
          fromUtf8(
            open(
              contentKey,
              event.blob,
              `ww-buddies/v1/event|${to.inboxId}|${slotId}|${event.eventId}`
            )
          )
        )
      }
      return {
        ...env,
        reactionEventsTo,
        reactionAlerts,
        reactionEntries,
        plaintext,
      }
    }

    it('lists the six reactions in order, by id', () => {
      expect(BADGE_REACTION_EMOJI).toEqual([
        { id: 'party', emoji: '🎉' },
        { id: 'confetti', emoji: '🎊' },
        { id: 'fire', emoji: '🔥' },
        { id: 'clap', emoji: '👏' },
        { id: 'thumbsUp', emoji: '👍' },
        { id: 'raisedHands', emoji: '🙌' },
      ])
      expect(BADGE_REACTION_IDS).toEqual(BADGE_REACTION_EMOJI.map((r) => r.id))
      expect(BADGE_REACTION_IDS.every(isBadgeReactionEmoji)).toBe(true)
      for (const other of ['toString', 'constructor', '🎉', 'heart', '', null])
        expect(isBadgeReactionEmoji(other)).toBe(false)
    })

    it('reads only well-formed reactions, by id, dropping unknown fields', () => {
      const valid = {
        v: 1,
        badge: { c: 'yearRound', l: 3 },
        e: 'party',
        rev: 5,
      }
      expect(badgeReactionSchema.parse({ ...valid, extra: true })).toEqual(
        valid
      )
      expect(
        badgeReactionSchema.parse({ ...valid, badge: { c: 'firstBuddy' } })
      ).toMatchObject({ badge: { c: 'firstBuddy' } })
      for (const bad of [
        { ...valid, e: '🎉' },
        { ...valid, e: 'heart' },
        { ...valid, v: 2 },
        { ...valid, rev: '5' },
        { ...valid, badge: { c: 'yearRound', l: 9 } },
        { ...valid, badge: { c: '' } },
        { ...valid, badge: 'yearRound.3' },
        { v: 1, e: 'party', rev: 5 },
        'party',
        null,
      ])
        expect(badgeReactionSchema.safeParse(bad).success).toBe(false)
    })

    it('sends a reaction as an id under a deterministic event id, and the owner keeps it', async () => {
      const env = await reactionDuo()
      const { levi, anna, reactionEventsTo, reactionAlerts, plaintext } = env
      const rev = START + SPACING
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'party')
      expect(
        levi.store.getState().sentBadgeReactions[anna.inboxId]['yearRound.3']
      ).toEqual({ e: 'party', rev, at: rev, sentRev: rev, alertRev: rev })
      const [event] = reactionEventsTo(anna)
      expect(event.eventId).toBe(reactionKey(levi, anna, 'yearRound.3', rev))

      expect(plaintext(levi, anna, event)).toEqual({
        v: 1,
        badge: { c: 'yearRound', l: 3 },
        e: 'party',
        rev,
      })
      expect(reactionAlerts()).toHaveLength(1)

      await anna.engine.sync()
      expect(anna.store.getState().badgeReactions).toEqual({
        'yearRound.3': {
          [levi.inboxId]: { e: 'party', at: event.createdAt, rev },
        },
      })
      expect(env.reactionEntries(anna)).toEqual([
        {
          id: event.eventId,
          seq: event.seq,
          kind: 'badgeReaction',
          from: levi.inboxId,
          name: 'Levi',
          badges: [{ c: 'yearRound', l: 3 }],
          reaction: 'party',
          at: event.createdAt,
          read: false,
        },
      ])

      anna.store.setState({ syncSeq: 0 })
      await anna.engine.sync()
      expect(env.reactionEntries(anna)).toHaveLength(1)
    })

    it('retries a reaction whose send seemed to fail under the same id, alerting once', async () => {
      const env = await reactionDuo()
      const { levi, anna, reactionEventsTo, reactionAlerts } = env

      let lost = true
      env.setAfterOp(async (op) => {
        if (op === 'event/put' && lost) {
          lost = false
          throw new TypeError('Network request failed')
        }
      })
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'clap')
      const sent =
        levi.store.getState().sentBadgeReactions[anna.inboxId]['yearRound.3']
      expect(sent.sentRev).toBeUndefined()
      expect(reactionEventsTo(anna)).toHaveLength(1)
      await levi.engine.sync()
      expect(
        levi.store.getState().sentBadgeReactions[anna.inboxId]['yearRound.3']
          .sentRev
      ).toBe(sent.rev)
      expect(reactionEventsTo(anna)).toHaveLength(1)
      expect(reactionAlerts()).toHaveLength(1)
    })

    it('keeps trying offline for a week, then stops', async () => {
      const env = await reactionDuo()
      const { levi, anna, reactionEventsTo, offlineOps, advance } = env
      offlineOps.add('event/put')
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'fire')

      expect(
        levi.store.getState().sentBadgeReactions[anna.inboxId]['yearRound.3']
      ).toMatchObject({ e: 'fire' })
      offlineOps.delete('event/put')
      await levi.engine.sync()
      expect(reactionEventsTo(anna)).toHaveLength(1)

      offlineOps.add('event/put')
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'clap')
      advance(8 * 24 * HOUR)
      offlineOps.delete('event/put')
      await levi.engine.sync()
      expect(reactionEventsTo(anna)).toHaveLength(1)
    })

    it('replaces a reaction with a newer choice, keeping one entry, and ignores older ones', async () => {
      const env = await reactionDuo()
      const { levi, anna, user, advance, reactionEventsTo, reactionEntries } =
        env
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'party')

      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'party')
      expect(reactionEventsTo(anna)).toHaveLength(1)
      await anna.engine.sync()
      expect(reactionEntries(anna)).toHaveLength(1)

      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'fire')
      const events = reactionEventsTo(anna)
      expect(events).toHaveLength(2)
      expect(events[1].eventId).not.toBe(events[0].eventId)
      await anna.engine.sync()
      const rev = START + SPACING + 1
      expect(
        anna.store.getState().badgeReactions['yearRound.3'][levi.inboxId]
      ).toMatchObject({ e: 'fire', rev })
      expect(reactionEntries(anna)).toMatchObject([
        { reaction: 'fire', id: events[1].eventId },
      ])

      await rawWriter(levi, anna).event(BADGE_REACTION_PUSH_KIND, {
        v: 1,
        badge: yearRound,
        e: 'clap',
        rev: rev - 10,
      })
      await anna.engine.sync()
      expect(
        anna.store.getState().badgeReactions['yearRound.3'][levi.inboxId].e
      ).toBe('fire')
      expect(reactionEntries(anna)).toHaveLength(1)

      anna.engine.dismissNotification(reactionEntries(anna)[0].id)
      const levisIpad = user('Levi', undefined, levi.seed)
      await levisIpad.engine.sync()
      expect(
        levisIpad.store.getState().sentBadgeReactions[anna.inboxId]
      ).toBeUndefined()
      advance(HOUR)
      await levisIpad.engine.reactToBadge(anna.inboxId, yearRound, 'fire')
      await anna.engine.sync()
      expect(
        anna.store.getState().badgeReactions['yearRound.3'][levi.inboxId]
      ).toMatchObject({ e: 'fire', rev: START + SPACING + HOUR })
      expect(reactionEntries(anna)).toEqual([])
    })

    it('ignores malformed reactions without failing the sync', async () => {
      const env = await reactionDuo()
      const { levi, anna, reactionEntries } = env
      const raw = rawWriter(levi, anna)
      const valid = { v: 1, badge: yearRound, e: 'party', rev: 1 }
      for (const body of [
        { ...valid, e: '🎉' },
        { ...valid, e: 'heart' },
        { ...valid, v: 2 },
        { ...valid, badge: { c: 'futureBadge', l: 1 } },
        { ...valid, badge: { c: 'yearRound' } },
        { v: 1, e: 'party', rev: 1 },
        'junk',
      ])
        await raw.event(BADGE_REACTION_PUSH_KIND, body)
      await raw.event(BADGE_REACTION_PUSH_KIND, { ...valid, rev: 2 })
      await anna.engine.sync()
      expect(anna.store.getState().badgeReactions).toEqual({
        'yearRound.3': { [levi.inboxId]: expect.objectContaining({ rev: 2 }) },
      })
      expect(reactionEntries(anna)).toHaveLength(1)
    })

    it("ignores reactions from anyone but an active buddy, to badges the User doesn't have, and with badges off", async () => {
      const env = await reactionDuo()
      const { levi, anna, reactionEntries } = env
      const raw = rawWriter(levi, anna)
      const react = (badge: { c: string; l?: number }, rev: number) =>
        raw.event(BADGE_REACTION_PUSH_KIND, { v: 1, badge, e: 'clap', rev })

      await react({ c: 'monthsShared', l: 1 }, 1)
      await react({ c: 'yearRound', l: 4 }, 2)
      await react({ c: 'yearRound', l: 2 }, 3)
      await anna.engine.sync()
      expect(Object.keys(anna.store.getState().badgeReactions)).toEqual([
        'yearRound.2',
      ])

      anna.setShowBadges(false)
      await react(yearRound, 4)
      await anna.engine.sync()
      anna.setShowBadges(true)
      expect(anna.store.getState().badgeReactions['yearRound.3']).toBe(
        undefined
      )

      anna.store.setState((state) => ({
        buddies: state.buddies.map(
          (b): Buddy => ({
            ...b,
            status: 'awaitingConfirm',
            expiresAt: START + 7 * 24 * HOUR,
          })
        ),
      }))
      await react({ c: 'firstBuddy' }, 5)
      await anna.engine.sync()
      expect(anna.store.getState().badgeReactions.firstBuddy).toBe(undefined)
      expect(reactionEntries(anna)).toHaveLength(1)
    })

    it('reacts only to an active buddy’s shared badge, while Buddies and badges are on', async () => {
      const env = await reactionDuo()
      const { levi, anna, reactionEventsTo } = env
      const sent = () => levi.store.getState().sentBadgeReactions

      await levi.engine.reactToBadge(
        anna.inboxId,
        { c: 'monthsShared', l: 1 },
        'party'
      )
      await levi.engine.reactToBadge(
        anna.inboxId,
        { c: 'futureBadge' } as unknown as typeof yearRound,
        'party'
      )
      await levi.engine.reactToBadge(
        anna.inboxId,
        yearRound,
        'heart' as BadgeReactionEmoji
      )
      await levi.engine.reactToBadge(
        'AAAAAAAAAAAAAAAAAAAAAA',
        yearRound,
        'fire'
      )
      levi.setEnabled(false)
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'party')
      levi.setEnabled(true)
      levi.setShowBadges(false)
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'party')
      levi.setShowBadges(true)
      expect(sent()).toEqual({})
      expect(reactionEventsTo(anna)).toEqual([])

      await levi.engine.setSharing({ badges: false })
      await levi.engine.reactToBadge(
        anna.inboxId,
        { c: 'yearRound', l: 1 },
        'thumbsUp'
      )
      expect(reactionEventsTo(anna)).toHaveLength(1)

      await anna.engine.setSharing({ badges: false })
      await levi.engine.sync()
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'party')
      expect(reactionEventsTo(anna)).toHaveLength(1)

      const solo = setup()
      const mom = solo.user('Mom')
      await mom.engine.reactToBadge(anna.inboxId, yearRound, 'party')
      expect(mom.store.getState().sentBadgeReactions).toEqual({})
      expect(solo.fake.inboxes.size).toBe(0)
    })

    it('alerts a buddy to at most one reaction in 20 hours, apart from badge news', async () => {
      const env = await reactionDuo()
      const { levi, anna, advance, reactionEventsTo, reactionAlerts } = env
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'party')

      advance(1000)
      await levi.engine.reactToBadge(
        anna.inboxId,
        { c: 'firstBuddy' },
        'raisedHands'
      )
      expect(reactionEventsTo(anna)).toHaveLength(2)
      expect(reactionAlerts()).toHaveLength(1)
      await anna.engine.sync()
      expect(env.reactionEntries(anna)).toHaveLength(2)

      advance(SPACING)
      await levi.engine.announceBadges(['monthsShared.3'])
      expect(env.badgeAlerts()).toHaveLength(1)

      advance(20 * HOUR)
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'fire')
      expect(reactionAlerts()).toHaveLength(2)
    })

    it('waits out the relay’s alert spacing after badge news, instead of losing the alert', async () => {
      const env = await reactionDuo()
      const { levi, anna, advance, reactionEventsTo, reactionAlerts } = env
      await levi.engine.announceBadges(['monthsShared.3'])
      expect(env.badgeAlerts()).toHaveLength(1)
      advance(2000)
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'confetti')
      expect(reactionEventsTo(anna)).toEqual([])
      expect(levi.store.getState().lastBadgeReactionAlertAt).toEqual({})
      expect(levi.timers).toHaveLength(1)
      expect(levi.timers[0].ms).toBe(SPACING - 2000)

      await levi.engine.sync()
      expect(reactionEventsTo(anna)).toEqual([])
      expect(levi.timers).toHaveLength(1)

      advance(SPACING)
      levi.timers[0].run()
      await vi.waitFor(() => expect(reactionEventsTo(anna)).toHaveLength(1))
      expect(reactionAlerts()).toHaveLength(1)
    })

    it('lists reactions already read with badge alerts off, when old, or as a new device’s backlog', async () => {
      const env = await reactionDuo()
      const { levi, anna, user, advance, reactionEntries } = env
      anna.store.setState({ badgeNotifications: false })
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'party')
      await anna.engine.sync()
      expect(reactionEntries(anna)).toMatchObject([{ read: true }])

      anna.store.setState({ badgeNotifications: true })
      await levi.engine.reactToBadge(anna.inboxId, { c: 'firstBuddy' }, 'clap')
      advance(25 * HOUR)
      await anna.engine.sync()
      expect(reactionEntries(anna)[0]).toMatchObject({
        reaction: 'clap',
        read: true,
      })

      const annasIpad = user('Anna', undefined, anna.seed)
      annasIpad.profile.badges = anna.profile.badges
      await annasIpad.engine.sync()
      expect(reactionEntries(annasIpad)).toHaveLength(2)
      expect(reactionEntries(annasIpad).every((n) => n.read)).toBe(true)
    })

    it('drops reactions both ways when a buddy is removed, and on delete-all', async () => {
      const env = await reactionDuo()
      const { levi, anna, reactionEntries } = env
      await levi.engine.reactToBadge(anna.inboxId, yearRound, 'party')
      await anna.engine.reactToBadge(
        levi.inboxId,
        { c: 'monthsShared', l: 2 },
        'clap'
      )
      await anna.engine.sync()
      await levi.engine.sync()
      expect(anna.store.getState().badgeReactions).not.toEqual({})
      expect(levi.store.getState().badgeReactions).not.toEqual({})

      await anna.engine.removeBuddy(levi.inboxId)
      expect(anna.store.getState()).toMatchObject({
        badgeReactions: {},
        sentBadgeReactions: {},
        lastBadgeReactionAlertAt: {},
      })
      expect(reactionEntries(anna)).toEqual([])

      await levi.engine.sync()
      expect(levi.store.getState()).toMatchObject({
        badgeReactions: {},
        sentBadgeReactions: {},
        lastBadgeReactionAlertAt: {},
      })
      expect(reactionEntries(levi)).toEqual([])

      const again = await reactionDuo()
      await again.levi.engine.reactToBadge(
        again.anna.inboxId,
        yearRound,
        'party'
      )
      await again.anna.engine.sync()
      await again.anna.engine.deleteEverything()
      expect(again.anna.store.getState()).toMatchObject({
        badgeReactions: {},
        sentBadgeReactions: {},
        notifications: [],
      })
    })

    it('registers the reaction push kind with badge alerts, and lists reactions only with badges on', () => {
      const { user } = setup()
      const anna = user('Anna')
      expect(anna.engine.badgePushKinds()).toEqual([
        BADGE_PUSH_KIND,
        BADGE_REACTION_PUSH_KIND,
      ])
      anna.store.setState({ badgeNotifications: false })
      expect(anna.engine.badgePushKinds()).toEqual([])
      anna.store.setState({ badgeNotifications: true })
      anna.setShowBadges(false)
      expect(anna.engine.badgePushKinds()).toEqual([])

      const entry = (id: string, kind: BuddyNotification['kind']) =>
        ({ id, kind, at: 0, read: false, name: 'Levi' }) as BuddyNotification
      const queue = [entry('a', 'badgeReaction'), entry('b', 'paired')]
      expect(
        listedNotifications(queue, { showBadges: false }).map((n) => n.id)
      ).toEqual(['b'])
    })

    it('lists reactions to a badge from active buddies, newest first', () => {
      const buddy = (inboxId: string, status: Buddy['status']) =>
        ({ inboxId, name: inboxId, status }) as Buddy
      const buddies = [
        buddy('anna', 'active'),
        buddy('mom', 'active'),
        buddy('joe', 'awaitingConfirm'),
      ]
      expect(
        badgeReactionsFrom(
          {
            anna: { e: 'party', at: 1, rev: 1 },
            mom: { e: 'fire', at: 2, rev: 2 },
            joe: { e: 'clap', at: 3, rev: 3 },
            gone: { e: 'clap', at: 4, rev: 4 },
          },
          buddies
        )
      ).toEqual([
        { inboxId: 'mom', buddy: buddies[1], e: 'fire', at: 2 },
        { inboxId: 'anna', buddy: buddies[0], e: 'party', at: 1 },
      ])
      expect(badgeReactionsFrom(undefined, buddies)).toEqual([])
    })
  })
})

describe('a User’s devices stay in step', () => {
  const saturday = { d: '2026-09-26', s: 600, m: 120 }
  const planSpec = (
    recipients: string[],
    version?: number,
    details: OutgoingShareSpec['details'] = saturday
  ): OutgoingShareSpec => ({
    key: planShareKey('sat'),
    type: 'plan',
    details,
    recipients,
    endsAt: Date.parse('2026-09-27T00:00:00Z'),
    expiresAt: Date.parse('2026-09-28T00:00:00Z'),
    ...(version === undefined ? {} : { version }),
  })

  async function flushRoster(device: User) {
    for (const timer of device.timers.splice(0)) timer.run()
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  async function invitedOnTwoDevices() {
    const env = setup()
    const levi = env.user('Levi')
    const mom = env.user('Mom')
    await pair(levi, mom)
    const momsIpad = env.user('Mom', undefined, mom.seed)
    await momsIpad.engine.sync()
    levi.setShares([planSpec([mom.inboxId])])
    await levi.engine.publishShares()
    await mom.engine.sync()
    await momsIpad.engine.sync()
    const key = Object.keys(mom.store.getState().incomingShares)[0]
    const replies = () =>
      env.fake.inboxes
        .get(levi.inboxId)!
        .events.filter((event) => event.kind === 'share.reply')
    return { ...env, levi, mom, momsIpad, key, replies }
  }

  it('shows an answer on every device, and only the one that answered sends it', async () => {
    const { advance, levi, mom, momsIpad, key, replies } =
      await invitedOnTwoDevices()
    expect(momsIpad.store.getState().incomingShares[key].status).toBe('pending')

    await mom.engine.replyToShare(key, 'going')
    await flushRoster(mom)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().incomingShares[key]).toMatchObject({
      status: 'going',
      unsentReplyRev: undefined,
    })
    expect(
      momsIpad.store.getState().notifications.find((n) => n.shareKey === key)
        ?.read
    ).toBe(true)
    expect(replies()).toHaveLength(1)

    advance(1000)
    await momsIpad.engine.replyToShare(key, 'declined')
    await flushRoster(momsIpad)
    await mom.engine.sync()
    expect(mom.store.getState().incomingShares[key].status).toBe('declined')
    expect(replies()).toHaveLength(2)
    await levi.engine.sync()
    expect(Object.values(levi.store.getState().shareReplies)[0]).toMatchObject({
      [mom.inboxId]: { status: 'declined' },
    })
  })

  it('drops an answer waiting to be sent when another device answered later', async () => {
    const { advance, mom, momsIpad, key, offlineOps, replies } =
      await invitedOnTwoDevices()
    offlineOps.add('event/put')
    await mom.engine.replyToShare(key, 'going')
    offlineOps.delete('event/put')
    expect(
      mom.store.getState().incomingShares[key].unsentReplyRev
    ).toBeDefined()

    advance(1000)
    await momsIpad.engine.replyToShare(key, 'declined')
    await flushRoster(momsIpad)
    await mom.engine.sync()
    expect(mom.store.getState().incomingShares[key]).toMatchObject({
      status: 'declined',
      unsentReplyRev: undefined,
    })
    expect(replies()).toHaveLength(1)
  })

  it("restores answers and the bell's read and dismissed entries on a new device", async () => {
    const { user, mom, key } = await invitedOnTwoDevices()
    await mom.engine.replyToShare(key, 'declined')
    const paired = mom.store
      .getState()
      .notifications.find((n) => n.kind === 'paired')!
    mom.engine.markNotificationRead(paired.id)
    mom.engine.dismissNotification(paired.id)
    await flushRoster(mom)

    const momsMac = user('Mom', undefined, mom.seed)
    await momsMac.engine.sync()
    expect(momsMac.store.getState().incomingShares[key].status).toBe('declined')
    const notifications = momsMac.store.getState().notifications
    expect(notifications.map((n) => n.id)).not.toContain(paired.id)
    expect(notifications.length).toBeGreaterThan(0)
    expect(notifications.every((n) => n.read)).toBe(true)
  })

  it('marks entries read on the other devices when the bell is read on one', async () => {
    const { mom, momsIpad } = await invitedOnTwoDevices()
    const unread = momsIpad.store
      .getState()
      .notifications.filter((n) => !n.read)
    expect(unread.length).toBeGreaterThan(0)
    for (const entry of mom.store.getState().notifications)
      mom.engine.markNotificationRead(entry.id)

    expect(mom.timers).toHaveLength(1)
    await flushRoster(mom)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().notifications.every((n) => n.read)).toBe(
      true
    )
  })

  it("doesn't carry an answer over to an invitation sent again after a cancel", async () => {
    const { advance, user, levi, mom, momsIpad, key } =
      await invitedOnTwoDevices()
    await mom.engine.replyToShare(key, 'going')
    await flushRoster(mom)
    await momsIpad.engine.sync()

    advance(1000)
    levi.setShares([])
    await levi.engine.publishShares()
    await mom.engine.sync()
    await momsIpad.engine.sync()
    advance(1000)
    levi.setShares([planSpec([mom.inboxId])])
    await levi.engine.publishShares()
    await mom.engine.sync()
    await momsIpad.engine.sync()
    for (const device of [mom, momsIpad])
      expect(device.store.getState().incomingShares[key].status).toBe('pending')

    await flushRoster(mom)
    const momsMac = user('Mom', undefined, mom.seed)
    await momsMac.engine.sync()
    expect(momsMac.store.getState().incomingShares[key].status).toBe('pending')
    expect(mom.store.getState().answerMarks[key]).toMatchObject({ s: 'none' })
  })

  it('passes over a request to join on every device after Not Now on one', async () => {
    const { user } = setup()
    const levi = user('Levi')
    const anna = user('Anna')
    await pair(levi, anna)
    const annasIpad = user('Anna', undefined, anna.seed)
    await annasIpad.engine.sync()
    await levi.engine.askToJoin(
      anna.inboxId,
      '2026-09-26',
      { s: 540, m: 120 },
      new Date('2026-09-26T09:00:00').getTime()
    )
    await anna.engine.sync()
    await annasIpad.engine.sync()
    const entry = anna.store
      .getState()
      .notifications.find((n) => n.kind === 'joinRequest')!
    anna.engine.dismissNotification(entry.id)
    await flushRoster(anna)
    await annasIpad.engine.sync()
    expect(
      annasIpad.store
        .getState()
        .notifications.some((n) => n.kind === 'joinRequest')
    ).toBe(false)
    expect(
      Object.values(annasIpad.store.getState().joinRequests)
    ).toMatchObject([{ dismissed: true }])
  })

  it('carries a nickname, color, and calendar choice to devices that already know the buddy', async () => {
    const { advance, user } = setup()
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    const momsIpad = user('Mom', undefined, mom.seed)
    await momsIpad.engine.sync()

    advance(1000)
    await mom.engine.setNickname(anna.inboxId, 'Annie')
    await mom.engine.setColor(anna.inboxId, '#A855F7')
    mom.engine.setShowOnCalendar(anna.inboxId, false)
    await flushRoster(mom)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().buddies[0]).toMatchObject({
      nickname: 'Annie',
      color: '#A855F7',
      overrides: { showOnCalendar: false },
    })

    advance(1000)
    await momsIpad.engine.setNickname(anna.inboxId, 'Anna B')
    await mom.engine.sync()
    expect(mom.store.getState().buddies[0].nickname).toBe('Anna B')
    expect(mom.store.getState().buddies[0].overrides).toEqual({
      showOnCalendar: false,
    })

    advance(1000)
    mom.engine.setShowOnCalendar(anna.inboxId, true)
    await flushRoster(mom)
    expect(mom.store.getState().buddies[0].overrides).toBeUndefined()
  })

  it('keeps a buddy’s own settings through an older app’s roster, and takes its calendar choice', async () => {
    const { fake, advance, user } = setup()
    const relay = relayPowers(fake)
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    advance(1000)
    await mom.engine.setBuddySetting(anna.inboxId, 'plans', false)
    const written = openRoster(mom, relay.rosterBlob(mom.inboxId))

    expect(written.buddies[0]).toMatchObject({
      showOnCalendar: true,
      overrides: { plans: false },
    })

    const { overrides, ...older } = written.buddies[0]
    expect(overrides).toEqual({ plans: false })
    relay.serveRoster(
      mom.inboxId,
      sealLegacyRoster(mom, {
        ...written,
        buddies: [
          {
            ...older,
            showOnCalendar: false,
            prefsAt: (older.prefsAt ?? 0) + 1000,
          },
        ],
      })
    )
    advance(2000)
    await mom.engine.sync()
    expect(mom.store.getState().buddies[0].overrides).toEqual({
      plans: false,
      showOnCalendar: false,
    })
  })

  it('moves a hidden calendar and muted requests from older saved state into their own settings', () => {
    const migrated = migrateLegacySettings({
      buddies: [
        { inboxId: 'a', showOnCalendar: false },
        { inboxId: 'b', showOnCalendar: true },
      ] as unknown as Buddy[],
      mutedJoinRequests: ['b'],
    })
    expect(migrated.buddies).toEqual([
      { inboxId: 'a', overrides: { showOnCalendar: false } },
      { inboxId: 'b' },
    ])
    expect(migrated.alertOverrides).toEqual({ b: { joinRequests: false } })
    expect(migrated).not.toHaveProperty('mutedJoinRequests')
  })

  it('sends a shared Plan from one device only, and a change to it as one alert', async () => {
    const { fake, user, advance, now } = setup()
    let withdrawn: number | undefined = undefined
    const deps = { withdrawnAt: () => withdrawn }
    const levi = user('Levi', undefined, undefined, deps)
    const anna = user('Anna')
    await pair(levi, anna)
    const created = now()
    levi.setShares([planSpec([anna.inboxId], created)])
    await levi.engine.publishShares()
    const planEvents = () =>
      fake.inboxes
        .get(anna.inboxId)!
        .events.filter((event) => event.kind.startsWith('plan.'))
    expect(planEvents()).toHaveLength(1)

    const levisIpad = user('Levi', undefined, levi.seed, deps)
    levisIpad.setShares([planSpec([anna.inboxId], created)])
    await levisIpad.engine.sync()
    await levisIpad.engine.publishShares()
    expect(planEvents()).toHaveLength(1)

    advance(60_000)
    const moved = planSpec([anna.inboxId], now(), { ...saturday, s: 660 })
    levi.setShares([moved])
    levisIpad.setShares([moved])
    const pushes = fake.pushes.length
    await levi.engine.publishShares()
    advance(30_000)
    await levisIpad.engine.publishShares()
    expect(planEvents()).toHaveLength(2)
    expect(fake.pushes).toHaveLength(pushes + 1)
    await anna.engine.sync()
    expect(
      Object.values(anna.store.getState().incomingShares)[0].details.s
    ).toBe(660)

    advance(60_000)
    withdrawn = now()
    levi.setShares([])
    levisIpad.setShares([])
    await levi.engine.publishShares()
    advance(30_000)
    await levisIpad.engine.publishShares()
    expect(planEvents().map((event) => event.kind)).toEqual([
      'plan.invite',
      'plan.update',
      'plan.cancel',
    ])
    expect(fake.pushes).toHaveLength(pushes + 2)
  })

  it('takes a shared Plan that arrived from another device as sent', async () => {
    const { fake, user, now } = setup()
    const levi = user('Levi')
    const anna = user('Anna')
    await pair(levi, anna)
    const levisIpad = user('Levi', undefined, levi.seed)
    await levisIpad.engine.sync()
    const spec = planSpec([anna.inboxId], now())
    levi.setShares([spec])
    await levi.engine.publishShares()

    levisIpad.setShares([spec])
    levisIpad.engine.adoptShares([spec.key])
    await levisIpad.engine.publishShares()
    expect(
      fake.inboxes
        .get(anna.inboxId)!
        .events.filter((event) => event.kind.startsWith('plan.'))
    ).toHaveLength(1)
  })

  it("leaves Buddy Cards to the device with the Profile photo, except changes made where it's missing", async () => {
    const { user } = setup()
    const plans: Plans = { dayPlans: [], recurringPlans: [] }
    const levi = user('Levi', plans)
    const anna = user('Anna')
    const photo = { t: 'image', v: 'AAAA' } as const
    levi.profile.avatar = photo
    await pair(levi, anna)
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].avatar).toEqual(photo)

    const levisIpad = user('Levi', plans, levi.seed)
    levisIpad.profile.photoUnavailable = true
    await levisIpad.engine.sync()

    plans.dayPlans = [dayPlan('2026-09-28', 60)]
    await levisIpad.engine.publishCards()
    await anna.engine.sync()
    expect(anna.store.getState().buddies[0].avatar).toEqual(photo)
    expect(anna.store.getState().cards[levi.inboxId].days).toEqual([])

    await levisIpad.engine.publishCards({ edited: true })
    await anna.engine.sync()
    expect(anna.store.getState().cards[levi.inboxId].days).toHaveLength(1)
    expect(anna.store.getState().buddies[0].avatar).toBeUndefined()
  })

  it('keeps the newest marks, and a full roster with them fits the relay cap', () => {
    const id = () => toB64u(random(16))
    const at = 1_790_000_000_000
    const answers = Object.fromEntries(
      Array.from({ length: MAX_ANSWER_MARKS + 10 }, (_, index) => [
        `${id()}|${id()}`,
        { s: 'declined', v: at, r: at + index, x: at + 1 } as const,
      ])
    )
    const kept = mergeAnswerMarks({}, answers, at)
    expect(Object.keys(kept)).toHaveLength(MAX_ANSWER_MARKS)
    expect(Math.min(...Object.values(kept).map((mark) => mark.r))).toBe(at + 10)
    const marks = mergeNotificationMarks(
      { read: {}, dismissed: {} },
      {
        read: Object.fromEntries(
          Array.from({ length: MAX_NOTIFICATION_MARKS }, (_, index) => [
            id(),
            at + index,
          ])
        ),
        dismissed: Object.fromEntries(
          Array.from({ length: 10 }, () => [
            `pending|${id()}|${id()}`,
            at + 1000,
          ])
        ),
      },
      at
    )
    expect(
      Object.keys(marks.read).length + Object.keys(marks.dismissed).length
    ).toBe(MAX_NOTIFICATION_MARKS)
    expect(Object.keys(marks.dismissed)).toHaveLength(10)

    const name = 'N'.repeat(60)
    const avatar = { t: 'emoji', v: '🧑🏽‍🦱' } as const
    const tenure = { kind: 'regularAuxiliary', since: '2019-09' } as const
    const dhPub = () => toB64u(random(32))
    const roster: Roster = {
      v: 1,
      version: 1_000_000,
      buddies: Array.from({ length: 5 }, (_, colorIndex) => ({
        inboxId: id(),
        name,
        nickname: name,
        avatar,
        tenure,
        dhPub: dhPub(),
        inviteSecret: id(),
        status: 'active',
        pairedAt: at,
        colorIndex,
        color: '#A855F7FF',
        showOnCalendar: true,
        prefsAt: at,
      })),
      outgoingInvites: Array.from({ length: 5 }, () => ({
        inviteId: id(),
        secret: id(),
        createdAt: at,
        expiresAt: at,
      })),
      incomingClaims: Array.from({ length: 5 }, () => ({
        inviteId: id(),
        secret: id(),
        name,
        avatar,
        tenure,
        dhPub: dhPub(),
        inboxId: id(),
        receivedAt: at,
        expiresAt: at,
      })),
      closedInviteIds: Object.fromEntries(
        Array.from({ length: 140 }, () => [id(), at])
      ),
      removedBuddies: Object.fromEntries(
        Array.from({ length: MAX_REMOVED_BUDDIES }, () => [id(), at])
      ),
      sharing: { photo: true, tenure: true, streak: true, updatedAt: at },
      answers: kept,

      read: {},
      dismissed: Object.fromEntries(
        Array.from({ length: MAX_NOTIFICATION_MARKS }, () => [
          `pending|${id()}|${id()}`,
          at,
        ])
      ),

      cars: {},
      leftCars: {},
    }
    const plaintext = utf8(JSON.stringify(rosterSchema.parse(roster)))

    expect(plaintext.length).toBeLessThan(32 * 1024 - 29)
  })

  it('reads a roster with marks it doesn’t understand, keeping the rest', () => {
    const id = () => toB64u(random(16))
    const key = `${id()}|${id()}`
    const good = { s: 'going', v: 1, r: 2, x: 3 }
    const parsed = rosterSchema.parse({
      v: 1,
      buddies: [],
      outgoingInvites: [],
      incomingClaims: [],
      answers: {
        [key]: good,
        [`${id()}|${id()}`]: { s: 'maybe', v: 1, r: 2, x: 3 },
        'not-a-key': good,
      },
      read: { [id()]: 1, 'not an id': 2 },
      dismissed: 'garbled',
    })
    expect(parsed.answers).toEqual({ [key]: good })
    expect(Object.keys(parsed.read)).toHaveLength(1)
    expect(parsed.dismissed).toEqual({})

    expect(
      rosterSchema.parse({
        v: 1,
        buddies: [],
        outgoingInvites: [],
        incomingClaims: [],
      })
    ).toMatchObject({ answers: {}, read: {}, dismissed: {} })
  })
})

describe('whosGoing', () => {
  const buddy = (inboxId: string, name: string): Buddy => ({
    inboxId,
    name,
    dhPub: 'pub',
    inviteSecret: 'secret',
    status: 'active',
    pairedAt: 0,
    colorIndex: 0,
  })
  const mike = buddy('mike-inbox', 'Mike')
  const share = (type: 'plan' | 'followUp'): IncomingShare => ({
    from: 'julia-inbox',
    shareId: 'share-1',
    type,
    rev: 1,
    details: { d: '2026-11-01' },
    expiresAt: 0,
    receivedAt: 0,
    status: 'going',
    people: [
      { t: guestTag('share-1', mike.inboxId), n: 'Michael' },
      { t: 'someone-else', n: 'MaCailah' },
    ],
    more: 2,
  })

  it("counts the organizer, the others going, and the User once they're going", () => {
    const going = whosGoing(share('plan'), 'going', [mike])
    expect(going.guests).toEqual([
      { kind: 'buddy', buddy: mike },
      { kind: 'guest', guest: { t: 'someone-else', n: 'MaCailah' } },
    ])
    expect(going.more).toBe(2)
    expect(going.count).toBe(6)
  })

  it("shows the others going to someone who hasn't said Going", () => {
    for (const status of ['pending', 'declined'] as const)
      expect(whosGoing(share('plan'), status, [mike])).toMatchObject({
        guests: [{ kind: 'buddy', buddy: mike }, { kind: 'guest' }],
        more: 2,
        count: 5,
      })
  })

  it('lists no one else on a Follow-up', () => {
    expect(whosGoing(share('followUp'), 'going', [mike])).toEqual({
      guests: [],
      more: 0,
      count: 2,
    })
  })
})
