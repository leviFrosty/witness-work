import { describe, expect, it, vi } from 'vitest'
import { fromB64u, fromUtf8, toB64u } from '@/features/buddies/lib/bytes'
import { open } from '@/features/buddies/lib/crypto'
import { rosterSchema } from '@/features/buddies/lib/schemas'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import {
  type Buddy,
  MAX_ANSWER_MARKS,
  MAX_BUDDIES,
  MAX_NOTIFICATION_MARKS,
  MAX_OPEN_INVITES,
  MAX_REMOVED_BUDDIES,
  MAX_ROSTER_PLAINTEXT_BYTES,
} from '@/features/buddies/lib/state'
import { random, setup } from '@/features/buddies/lib/testing/engineHarness'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const DAY = 24 * 60 * 60 * 1000
const id = () => toB64u(random(16))
const key = () => toB64u(random(32))

const longName = (n: number) =>
  `${'名'.repeat(57)}${String(n).padStart(3, '0')}`

describe('the roster at the buddy limit', () => {
  it('fits every buddy at their longest, with room to spare', async () => {
    const env = setup()
    const anna = env.user('Anna')
    await anna.engine.sync()
    const now = Date.now()

    const buddies: Buddy[] = Array.from({ length: MAX_BUDDIES }, (_, n) => ({
      inboxId: id(),
      name: longName(n),
      nickname: longName(n),
      avatar: { t: 'emoji', v: '👨‍👩‍👧‍👦' },
      tenure: { kind: 'specialPioneer', since: '2001-09' },
      dhPub: key(),
      inviteSecret: id(),
      status: 'active',
      pairedAt: now,
      colorIndex: n,
      color: '#12345678',
      overrides: {
        photo: false,
        tenure: false,
        streak: false,
        badges: false,
        pet: false,
        plans: false,
        planTimes: 'timeOfDay',
        showOnCalendar: true,
        petVisits: false,
      },
      prefsAt: now,
      expiresAt: now + 7 * DAY,
    }))
    const later = now + 30 * DAY
    const pairKey = () => `${id()}|${id()}`
    anna.store.setState({
      buddies,
      removedBuddies: Object.fromEntries(
        Array.from({ length: MAX_REMOVED_BUDDIES }, (_, n) => [id(), now - n])
      ),
      closedInviteIds: Object.fromEntries(
        Array.from({ length: 20 * 7 }, () => [id(), later])
      ),
      outgoingInvites: Array.from({ length: MAX_OPEN_INVITES }, () => ({
        inviteId: id(),
        secret: id(),
        createdAt: now,
        expiresAt: later,
      })),
      answerMarks: Object.fromEntries(
        Array.from({ length: MAX_ANSWER_MARKS }, () => [
          pairKey(),
          { s: 'maybe', v: now, r: now, x: later },
        ])
      ),
      notificationMarks: {
        read: Object.fromEntries(
          Array.from({ length: MAX_NOTIFICATION_MARKS }, () => [
            `pending|${id()}|${id()}`,
            later,
          ])
        ),
        dismissed: {},
      },
    } as never)
    anna.engine.noteCarMemberships()
    for (const { run } of anna.timers.splice(0)) run()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const { rosterKey, inboxId } = deriveIdentity(anna.seed)
    const blob = env.fake.inboxes.get(anna.inboxId)!.roster!.blob
    const plaintext = open(rosterKey, blob, `ww-buddies/v1/roster|${inboxId}`)
    expect(JSON.parse(fromUtf8(plaintext)).buddies).toHaveLength(MAX_BUDDIES)
    expect(plaintext.length).toBeLessThan(80 * 1024)
    expect(fromB64u(blob).length).toBeLessThanOrEqual(
      MAX_ROSTER_PLAINTEXT_BYTES + 29
    )

    const read = rosterSchema.parse(JSON.parse(fromUtf8(plaintext)))
    expect(read.buddies).toHaveLength(MAX_BUDDIES)
    expect(read.buddies.map((buddy) => buddy.nickname)).toEqual(
      buddies.map((buddy) => buddy.nickname)
    )
  })
})
