import { describe, expect, it, vi } from 'vitest'
import { fromB64u, toB64u } from '@/features/buddies/lib/bytes'
import {
  parsePushMarker,
  pushMarkerOf,
  type BuddiesPushMarker,
} from '@/features/buddies/lib/pushAlerts'
import { buddyAlertText } from '@/features/buddies/lib/pushAlertText'
import { followUpShareKey, planShareKey } from '@/features/buddies/lib/shares'
import {
  incomingShareKey,
  type OutgoingShareSpec,
} from '@/features/buddies/lib/state'
import { pair, setup } from '@/features/buddies/lib/testing/engineHarness'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))
vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const i18n = new I18n({ 'en-us': enUS })
  i18n.locale = 'en-us'
  return { default: i18n }
})

type Env = ReturnType<typeof setup>
type User = ReturnType<Env['user']>

/** The newest push the relay sent `user`, as its `ww` marker. */
const lastMarker = (env: Env, user: User): BuddiesPushMarker => {
  const pushes = env.fake.markers.filter((m) => m.inboxId === user.inboxId)
  return pushes[pushes.length - 1].marker
}

/** The alert `user` would show for their newest push, in English. */
async function alertFor(env: Env, user: User, marker = lastMarker(env, user)) {
  const outcome = await user.engine.describePush(marker)
  return 'alert' in outcome ? buddyAlertText(outcome.alert) : outcome
}

const saturday = {
  d: '2026-09-26',
  s: 600,
  m: 120,
  title: 'Cart witnessing',
  location: { name: 'Lakeside Kingdom Hall', address: '1 Main St' },
  note: 'Bring the cart',
}
const planSpec = (recipients: string[], details = saturday) =>
  ({
    key: planShareKey('sat'),
    type: 'plan',
    details,
    recipients,
    endsAt: Date.parse('2026-09-27T00:00:00Z'),
    expiresAt: Date.parse('2026-09-28T00:00:00Z'),
  }) satisfies OutgoingShareSpec
const followUpSpec = (recipients: string[]) =>
  ({
    key: followUpShareKey('visit'),
    type: 'followUp',
    details: {
      d: '2026-09-25',
      s: 900,
      firstName: 'Margarita',
      topic: 'Is there hope for the dead?',
      location: { address: '22 Elm Street' },
    },
    recipients,
    endsAt: Date.parse('2026-09-26T00:00:00Z'),
    expiresAt: Date.parse('2026-09-27T00:00:00Z'),
  }) satisfies OutgoingShareSpec

async function duo() {
  const env = setup()
  const levi = env.user('Levi')
  const anna = env.user('Anna')
  await pair(levi, anna)
  return { env, levi, anna }
}

describe('named Buddies alerts', () => {
  it('names who accepted an invite, from the claim the push carried', async () => {
    const env = setup()
    const levi = env.user('Levi')
    const joe = env.user('Joe')
    await joe.engine.acceptInvite(await levi.engine.createInvite())

    expect(await alertFor(env, levi)).toEqual({
      title: 'Joe accepted your invite',
      body: 'Open Buddies to confirm your new buddy.',
    })
  })

  it('names the inviter once they confirm, with the nickname kept here', async () => {
    const env = setup()
    const levi = env.user('Levi')
    const anna = env.user('Anna')
    await anna.engine.acceptInvite(await levi.engine.createInvite())
    await levi.engine.sync()
    await anna.engine.setNickname(
      anna.store.getState().buddies[0].inboxId,
      'Brother Levi'
    )
    const [claim] = levi.store.getState().incomingClaims
    await levi.engine.confirmClaim(claim.inviteId)

    expect(await alertFor(env, anna)).toEqual({
      title: 'You and Brother Levi are buddies now',
      body: "You can now see each other's planned service days.",
    })
  })

  it('gives the day and time of a Plan invitation, and none of its text', async () => {
    const { env, levi, anna } = await duo()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()

    const alert = await alertFor(env, anna)
    expect(alert).toEqual({
      title: 'Levi invited you to a Plan',
      body: 'Sat, Sep 26 · 10:00 AM',
    })
    expect(JSON.stringify(alert)).not.toMatch(/Cart|Lakeside|Main|cart/)
  })

  it("never puts a Follow-up's householder on the lock screen", async () => {
    const { env, levi, anna } = await duo()
    levi.setShares([followUpSpec([anna.inboxId])])
    await levi.engine.publishShares()

    const alert = await alertFor(env, anna)
    expect(alert).toEqual({
      title: 'Levi invited you to a Follow-up',
      body: 'Fri, Sep 25 · 3:00 PM',
    })
    expect(JSON.stringify(alert)).not.toMatch(/Margarita|hope|Elm/)
  })

  it('gives the new time of a changed Plan, and the old one of a canceled Plan', async () => {
    const { env, levi, anna } = await duo()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()

    env.advance(2 * 60 * 1000)
    levi.setShares([planSpec([anna.inboxId], { ...saturday, s: 660 })])
    await levi.engine.publishShares()
    expect(await alertFor(env, anna)).toEqual({
      title: 'Levi changed a Plan',
      body: 'Sat, Sep 26 · 11:00 AM',
    })
    await anna.engine.sync()

    env.advance(2 * 60 * 1000)
    levi.setShares([])
    await levi.engine.publishShares()
    expect(lastMarker(env, anna).kind).toBe('plan.cancel')
    expect(await alertFor(env, anna)).toEqual({
      title: 'Levi canceled a Plan',
      body: 'Sat, Sep 26 · 11:00 AM',
    })
  })

  it("says who's going and who can't make it, with which of your Plans", async () => {
    const { env, levi, anna } = await duo()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    await anna.engine.sync()
    const key = incomingShareKey(
      levi.inboxId,
      levi.engine.shareIdForKey(planShareKey('sat'))
    )

    await anna.engine.replyToShare(key, 'going')
    expect(await alertFor(env, levi)).toEqual({
      title: 'Anna is going',
      body: 'Your Plan · Sat, Sep 26 · 10:00 AM',
    })

    env.advance(2 * 60 * 1000)
    await anna.engine.replyToShare(key, 'declined')
    expect(await alertFor(env, levi)).toEqual({
      title: "Anna can't make it",
      body: 'Your Plan · Sat, Sep 26 · 10:00 AM',
    })
  })

  it('names who asks to join, and stays quiet for a buddy muted here', async () => {
    const { env, levi, anna } = await duo()
    const startsAt = new Date('2026-09-26T09:00:00').getTime()
    await levi.engine.askToJoin(
      anna.inboxId,
      '2026-09-26',
      { s: 540, m: 120 },
      startsAt
    )
    expect(await alertFor(env, anna)).toEqual({
      title: 'Levi would like to join you',
      body: 'Your Plan · Sat, Sep 26 · 9:00 AM',
    })

    anna.store.setState({ mutedJoinRequests: [levi.inboxId] })
    expect(await alertFor(env, anna)).toEqual({ quiet: true })
    anna.store.setState({
      mutedJoinRequests: [],
      joinRequestNotifications: false,
    })
    expect(await alertFor(env, anna)).toEqual({ quiet: true })
  })

  it('names the badges a buddy earned, and stays quiet with Badge Alerts off', async () => {
    const { env, levi, anna } = await duo()
    env.advance(65 * 1000)
    await levi.engine.announceBadges(['yearRound.2'])
    expect(await alertFor(env, anna)).toEqual({
      title: 'Levi earned a badge',
      body: 'Year Round, Silver',
    })

    env.advance(25 * 60 * 60 * 1000)
    await levi.engine.announceBadges(['monthsShared.1', 'returnVisits.3'])
    expect(await alertFor(env, anna)).toEqual({
      title: 'Levi earned new badges',
      body: 'Return Visits, Gold · Sharing the Good News, Bronze',
    })

    anna.store.setState({ badgeNotifications: false })
    expect(await alertFor(env, anna)).toEqual({ quiet: true })
  })

  it('says which badge a buddy reacted to, with the emoji', async () => {
    const { env, levi, anna } = await duo()
    anna.profile.badges = [{ c: 'yearRound', l: 3 }]
    await anna.engine.publishCards()
    await levi.engine.sync()
    env.advance(65 * 1000)
    await levi.engine.reactToBadge(
      anna.inboxId,
      { c: 'yearRound', l: 3 },
      'fire'
    )

    expect(lastMarker(env, anna).kind).toBe('badge.reaction')
    expect(await alertFor(env, anna)).toEqual({
      title: 'Levi reacted 🔥 to your badge',
      body: 'Year Round, Gold',
    })
  })

  it('fetches an event that was too big for the push, by its seq', async () => {
    const { env, levi, anna } = await duo()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    const { kind, seq } = lastMarker(env, anna)

    expect(await alertFor(env, anna, { kind, seq })).toEqual({
      title: 'Levi invited you to a Plan',
      body: 'Sat, Sep 26 · 10:00 AM',
    })
  })

  it('keeps the template when the event is missing, foreign, or tampered with', async () => {
    const { env, levi, anna } = await duo()
    levi.setShares([planSpec([anna.inboxId])])
    await levi.engine.publishShares()
    const marker = lastMarker(env, anna)

    // Sealed for Anna, so Levi has no key that opens it.
    expect(await levi.engine.describePush(marker)).toEqual({
      failed: 'unknownSender',
    })
    const bytes = fromB64u(marker.blob!)
    bytes[bytes.length - 1] ^= 1
    expect(
      await anna.engine.describePush({ ...marker, blob: toB64u(bytes) })
    ).toEqual({ failed: 'unknownSender' })
    expect(
      await anna.engine.describePush({ kind: marker.kind, seq: 9_999 })
    ).toEqual({ failed: 'noEvent' })
    expect(
      await anna.engine.describePush({ ...marker, kind: 'plan.joined' })
    ).toEqual({ failed: 'unknownKind' })
    // Buddies never started here.
    const stranger = env.user('Stranger')
    expect(await stranger.engine.describePush(marker)).toEqual({
      failed: 'noContext',
    })
  })
})

describe('Buddies push markers', () => {
  const eventId = 'AAAAAAAAAAAAAAAAAAAAAA'

  it('reads the marker from iOS payloads and Android data', () => {
    const ww = { kind: 'plan.invite', seq: 4, eventId, blob: 'AQAB' }
    expect(pushMarkerOf({ ww })).toEqual(ww)
    expect(pushMarkerOf({ dataString: JSON.stringify({ ww }) })).toEqual(ww)
    expect(pushMarkerOf({ dataString: '{' })).toBeNull()
    expect(pushMarkerOf({ reminder: {} })).toBeNull()
    expect(pushMarkerOf(undefined)).toBeNull()
  })

  it('drops what it cannot use, keeping the kind', () => {
    expect(parsePushMarker({ kind: 'plan.invite' })).toEqual({
      kind: 'plan.invite',
    })
    expect(
      parsePushMarker({ kind: 'k', seq: 1.5, eventId: 'short', blob: 'AQAB' })
    ).toEqual({ kind: 'k' })
    expect(parsePushMarker({ kind: 'k', eventId, blob: 'not b64u!' })).toEqual({
      kind: 'k',
    })
    expect(parsePushMarker({ seq: 1 })).toBeNull()
    expect(parsePushMarker('ww')).toBeNull()
  })
})
