import { describe, expect, it, vi } from 'vitest'
import { fromUtf8, toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { seal } from '@/features/buddies/lib/crypto'
import {
  aad,
  deriveDirection,
  deriveIdentity,
  deriveInvite,
  derivePairSecret,
} from '@/features/buddies/lib/keys'
import { fromB64u } from '@/features/buddies/lib/bytes'
import {
  type BuddiesKeyChangeProgress,
  createBuddiesKeyChange,
  RECONNECT_WAIT_MS,
  SUSPENDED_WAIT_MS,
} from '@/features/buddies/lib/keyChange'
import { RelayError } from '@/features/buddies/lib/relay'
import {
  type Buddy,
  cappedQueue,
  MAX_NOTIFICATIONS,
  pendingReconnects,
  withPendingInvitesQueued,
} from '@/features/buddies/lib/state'
import { BuddyInviteError } from '@/features/buddies/lib/engine'
import {
  ownerAuthFor,
  pair,
  random,
  setup,
} from '@/features/buddies/lib/testing/engineHarness'
import {
  deriveAccountSigningKey,
  signInboxLink,
} from '@/lib/serverAccount/keys'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

type Env = ReturnType<typeof setup>
type User = ReturnType<Env['user']>

/** Where a device keeps the step's progress (its secret storage). */
function memoryProgress() {
  let value: string | null = null
  return {
    read: async () => value,
    write: async (next: string) => {
      value = next
    },
    remove: async () => {
      value = null
    },
    current: (): BuddiesKeyChangeProgress | null =>
      value ? (JSON.parse(value) as BuddiesKeyChangeProgress) : null,
  }
}

/**
 * Steps 3 and 4 of a key change on `user`'s device: the server moves the
 * account to a new key (`account/rekey`), and the device stores it. Returns the
 * Buddies step (`run`) as the key change calls it, and what it saved.
 */
async function rotate(
  env: Env,
  user: User,
  oldKey: Uint8Array = user.seed,
  progress = memoryProgress()
) {
  const newKey = random(32)
  const accountId = await user.sessions.withSession(
    async (_, session) => session.accountId
  )
  env.fake.accounts.get(accountId)!.accountPub =
    deriveAccountSigningKey(newKey).publicKey
  user.setRootSeed(newKey)
  const sent: number[] = []
  const skipped: string[] = []
  const notSent: string[] = []
  const step = createBuddiesKeyChange({
    relay: user.relay,
    engine: user.engine,
    progress,
    randomBytes: random,
    now: env.now,
    onReconnectSent: () => sent.push(env.now()),
    onInvitesSkipped: (reason) => skipped.push(reason),
    onReconnectNotSent: (reason) => notSent.push(reason),
  })
  return {
    oldKey,
    newKey,
    accountId,
    oldInboxId: deriveIdentity(oldKey).inboxId,
    newInboxId: deriveIdentity(newKey).inboxId,
    run: () => step.reset({ oldKey, newKey, accountId }),
    carryOn: step.carryOn,
    leaveNow: step.leaveNow,
    progress: progress.current,
    store: progress,
    sent,
    skipped,
    notSent,
  }
}

/**
 * Step 0 on `user`'s device, while their key is still the account's: the
 * Buddies part of preparing a key change.
 */
async function prepare(user: User) {
  const accountId = await user.sessions.withSession(
    async (_, session) => session.accountId
  )
  const step = createBuddiesKeyChange({
    relay: user.relay,
    engine: user.engine,
    progress: memoryProgress(),
    randomBytes: random,
    now: Date.now,
  })
  return step.prepare({ oldKey: user.seed, accountId })
}

/** Links `owner`'s inbox to `thief`'s account, with `owner`'s old key. */
function linkToThief(thief: User, owner: User) {
  const old = deriveIdentity(owner.seed)
  return thief.relay.registerInbox({
    inboxId: old.inboxId,
    ownerSeed: old.ownerSeed,
    ownerPub: old.ownerPub,
    link: {
      sign: (accountId) =>
        signInboxLink(
          deriveAccountSigningKey(thief.seed),
          accountId,
          old.inboxId,
          old.ownerPub
        ),
    },
  })
}

const reconnectEvents = (env: Env, inboxId: string) =>
  env.fake.inboxes
    .get(inboxId)!
    .events.filter((event) => event.kind === 'pair.reconnect')

describe('resetting Buddies when the account key changes', () => {
  it('moves to a new inbox on the same account, and each buddy reconnects with one tap', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    mom.engine.setNickname(anna.inboxId, 'Annie')
    const annasSlotBefore = [
      ...env.fake.inboxes.get(anna.inboxId)!.slots.keys(),
    ]

    const change = await rotate(env, mom)
    expect(await change.run()).toMatchObject({ done: false })

    // The new inbox is the account's, and the old one is gone, naming it.
    expect(env.fake.inboxAccounts.get(change.newInboxId)).toBe(change.accountId)
    expect(env.fake.inboxes.has(change.oldInboxId)).toBe(false)
    expect(env.fake.successors.get(change.oldInboxId)?.successor).toBe(
      change.newInboxId
    )
    expect(mom.store.getState()).toMatchObject({
      registeredInboxId: change.newInboxId,
      buddies: [],
    })
    // Mom's old slot stays in Anna's inbox until she reconnects, so the
    // invitation isn't deleted with it before she reads it.
    expect([...env.fake.inboxes.get(anna.inboxId)!.slots.keys()]).toEqual(
      annasSlotBefore
    )
    expect(reconnectEvents(env, anna.inboxId)).toHaveLength(1)
    expect(change.sent).toHaveLength(1)
    expect(env.fake.pushes).toContainEqual({
      inboxId: anna.inboxId,
      kind: 'pair.reconnect',
    })

    await anna.engine.sync()
    const offer = anna.store.getState().reconnectOffers[change.oldInboxId]
    expect(offer).toMatchObject({
      invites: [{ inboxId: change.newInboxId }],
      name: 'Mom',
    })
    expect(anna.store.getState().notifications[0]).toMatchObject({
      kind: 'reconnect',
      name: 'Mom',
      reconnect: change.oldInboxId,
    })

    expect(await anna.engine.acceptReconnect(change.oldInboxId)).toEqual({
      claimed: true,
    })
    // Anna's device asked the relay where Mom's old inbox went.
    expect(
      env.fake.requests.findLast((r) => r.op === 'inbox/successor')?.body
    ).toEqual({ inboxId: change.oldInboxId })
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: change.newInboxId, status: 'awaitingConfirm', name: 'Mom' },
    ])
    expect(anna.store.getState().reconnectOffers).toEqual({})
    expect(
      anna.store.getState().notifications.some((n) => n.kind === 'reconnect')
    ).toBe(false)
    // Anna ended the old pairing herself: Mom's old key can't write there.
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(1)
    expect([...env.fake.inboxes.get(anna.inboxId)!.slots.keys()]).not.toEqual(
      annasSlotBefore
    )

    // Mom's device confirms her without asking, keeping her nickname.
    await mom.engine.sync()
    expect(mom.store.getState().buddies).toMatchObject([
      { inboxId: anna.inboxId, status: 'active', nickname: 'Annie' },
    ])
    expect(mom.store.getState().incomingClaims).toEqual([])
    expect(
      mom.store.getState().notifications.some((n) => n.kind === 'claim')
    ).toBe(false)
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: change.newInboxId, status: 'active' },
    ])

    // Claimed: the next sync leaves her, and the old pairings' keys go.
    expect(await change.carryOn()).toEqual({ done: true })
    expect(change.progress()).toBeNull()
  })

  it('leaves a buddy who never reconnects a day after inviting them', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)

    const change = await rotate(env, mom)
    const first = await change.run()
    expect(first.done).toBe(false)
    if (first.done) return
    expect(first.retryAt).toBe(env.now() + RECONNECT_WAIT_MS)

    env.advance(RECONNECT_WAIT_MS - 1)
    expect((await change.run()).done).toBe(false)
    env.advance(1)
    expect(await change.run()).toEqual({ done: true })
    // An older app sees Mom leave, as after Delete Buddies.
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toEqual([])
  })

  it('still reconnects a buddy who read the invitation before Mom left', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)

    const change = await rotate(env, mom)
    await change.run()
    await anna.engine.sync()
    env.advance(RECONNECT_WAIT_MS)
    expect(await change.run()).toEqual({ done: true })

    // The slot went, and the old Mom with it; the offer stays.
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toEqual([])
    await anna.engine.acceptReconnect(change.oldInboxId)
    await mom.engine.sync()
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: change.newInboxId, status: 'active' },
    ])
  })

  it('invites and seals every buddy at once, five included', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const buddies = ['Anna', 'Ben', 'Cara', 'Dan', 'Eve'].map((name) =>
      env.user(name)
    )
    for (const buddy of buddies) await pair(mom, buddy)

    const change = await rotate(env, mom)
    expect((await change.run()).done).toBe(false)
    // The relay holds 5 open invites, and the new inbox has no slots yet.
    expect(change.sent).toHaveLength(5)
    expect(change.notSent).toEqual([])
    for (const buddy of buddies) {
      expect(reconnectEvents(env, buddy.inboxId)).toHaveLength(1)
      expect(
        [...env.fake.inboxes.get(buddy.inboxId)!.slots.values()].every(
          (slot) => slot.sealed
        )
      ).toBe(true)
    }
  })

  it('seals and leaves at once a buddy it finds no room to invite', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    // Never on a new inbox; should the relay refuse anyway, nothing waits.
    env.fake.refusals.set('invite/create', { status: 429, error: 'limit' })
    const change = await rotate(env, mom)
    expect(await change.run()).toEqual({ done: true })
    expect(change.notSent).toEqual(['noRoom'])
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
  })

  it.each([
    'inbox/sync',
    'inbox/register',
    'invite/create',
    'roster/put',
    'event/put',
    'inbox/delete',
    'slot/leave',
  ])(
    'picks up where it left off when the app is killed during %s',
    async (killedOp) => {
      const env = setup()
      const mom = env.user('Mom')
      const anna = env.user('Anna')
      const ben = env.user('Ben')
      await pair(mom, anna)
      await pair(mom, ben)
      const change = await rotate(env, mom)

      if (killedOp === 'slot/leave') {
        // Only reached once someone reconnects.
        await change.run()
        await anna.engine.sync()
        await anna.engine.acceptReconnect(change.oldInboxId)
        await mom.engine.sync()
      }
      // Leaves the step in the middle, after the relay handled the op.
      let killed = false
      env.setAfterOp(async (op) => {
        if (op !== killedOp || killed) return
        killed = true
        throw new Error('killed')
      })
      await change.run().catch(() => {})
      expect(killed).toBe(true)
      env.setAfterOp(null)
      await change.run()

      // One invitation each, to the one new inbox.
      const newInvites = [...env.fake.invites.values()].filter(
        (invite) => invite.inboxId === change.newInboxId
      )
      expect(newInvites.length).toBeLessThanOrEqual(2)
      for (const buddy of [anna, ben])
        expect(reconnectEvents(env, buddy.inboxId).length).toBeLessThanOrEqual(
          1
        )
      expect(env.fake.inboxes.has(change.oldInboxId)).toBe(false)

      // Everyone can still reconnect.
      for (const buddy of [anna, ben]) {
        await buddy.engine.sync()
        if (buddy.store.getState().reconnectOffers[change.oldInboxId])
          await buddy.engine.acceptReconnect(change.oldInboxId)
      }
      await mom.engine.sync()
      expect(
        mom.store
          .getState()
          .buddies.map((b) => b.inboxId)
          .sort()
      ).toEqual([anna.inboxId, ben.inboxId].sort())
      expect(await change.run()).toEqual({ done: true })
    }
  )

  it('finds former buddies from the old roster when this device already moved on', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)

    const change = await rotate(env, mom)
    // A sync with the new key wiped the old inbox's data here first.
    await mom.engine.sync()
    expect(mom.store.getState().buddies).toEqual([])

    await change.run()
    expect(reconnectEvents(env, anna.inboxId)).toHaveLength(1)
    await anna.engine.sync()
    await anna.engine.acceptReconnect(change.oldInboxId)
    await mom.engine.sync()
    expect(mom.store.getState().buddies).toMatchObject([
      { inboxId: anna.inboxId, status: 'active' },
    ])
  })

  it('lets another Apple device that gets the new key share the new inbox without sending anything', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const momsIpad = env.user('Mom', undefined, mom.seed)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().buddies).toHaveLength(1)

    const change = await rotate(env, mom)
    await change.run()
    const invites = env.fake.invites.size
    const inboxes = env.fake.inboxes.size

    // iCloud Keychain brings the iPad the new key.
    momsIpad.setRootSeed(change.newKey)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().registeredInboxId).toBe(change.newInboxId)
    expect(env.fake.invites.size).toBe(invites)
    expect(env.fake.inboxes.size).toBe(inboxes)
    expect(reconnectEvents(env, anna.inboxId)).toHaveLength(1)

    // The iPad confirms her too, from the roster, without asking.
    await anna.engine.sync()
    await anna.engine.acceptReconnect(change.oldInboxId)
    await momsIpad.engine.sync()
    expect(momsIpad.store.getState().buddies).toMatchObject([
      { inboxId: anna.inboxId, status: 'active' },
    ])
    expect(
      momsIpad.store.getState().notifications.some((n) => n.kind === 'claim')
    ).toBe(false)
  })

  it('finishes leaving after the change is over, without the old key', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    await change.run()

    // The key change deleted its record (and K1); what's left needs neither.
    const left = change.progress()!
    expect(JSON.stringify(left)).not.toContain(toB64u(change.oldKey))
    env.advance(RECONNECT_WAIT_MS)
    expect(await change.carryOn()).toEqual({ done: true })
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
  })

  it('holds Buddies syncs and resets while the key change has stored the new key', async () => {
    const env = setup()
    const progress = memoryProgress()
    let stored = false
    const mom = env.user('Mom', undefined, random(32), {
      // As the app: from the stored key until the step saved the pairings.
      paused: async () => stored && progress.current() === null,
    })
    const anna = env.user('Anna')
    await pair(mom, anna)
    mom.engine.setNickname(anna.inboxId, 'Annie')

    const change = await rotate(env, mom, mom.seed, progress)
    stored = true
    const cancelled = new RelayError('cancelled', 0)
    await expect(mom.engine.sync()).rejects.toEqual(cancelled)
    await expect(mom.engine.deleteEverything()).rejects.toEqual(cancelled)
    await expect(mom.engine.leaveThisDevice()).rejects.toEqual(cancelled)
    await expect(mom.engine.startNewInbox(change.newInboxId)).rejects.toEqual(
      cancelled
    )
    // The buddy list the reset needs is still here.
    expect(mom.store.getState().buddies).toHaveLength(1)
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(1)

    await change.run()
    await anna.engine.sync()
    await anna.engine.acceptReconnect(change.oldInboxId)
    await mom.engine.sync()
    expect(mom.store.getState().buddies).toMatchObject([
      { inboxId: anna.inboxId, nickname: 'Annie' },
    ])
  })

  it('leaves the last change’s buddies when the key changes again', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const first = await rotate(env, mom)
    await first.run()
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(1)

    const second = await rotate(env, mom, first.newKey, first.store)
    await second.run()
    // The first change's old slot is gone; the second had no one to invite.
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
    expect(env.fake.inboxes.has(first.newInboxId)).toBe(false)
    expect(second.progress()).toBeNull()
  })

  it('registers the new inbox again when the relay refuses it as the successor', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    const account = env.fake.accounts.get(change.accountId)!
    const newKeyPub = account.accountPub
    // The new inbox's link went stale before the old one went: refused once,
    // then linked again under the account's key.
    let registers = 0
    let deletes = 0
    env.setAfterOp(async (op) => {
      if (op === 'inbox/register' && ++registers === 2)
        account.accountPub = deriveAccountSigningKey(random(32)).publicKey
      if (op === 'inbox/delete' && ++deletes === 1)
        account.accountPub = newKeyPub
    })
    expect((await change.run()).done).toBe(false)
    env.setAfterOp(null)
    expect(env.fake.successors.get(change.oldInboxId)?.successor).toBe(
      change.newInboxId
    )
    expect(reconnectEvents(env, anna.inboxId)).toHaveLength(1)
    expect(change.skipped).toEqual([])
  })

  it('ends without invites when the relay keeps refusing the successor', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    const account = env.fake.accounts.get(change.accountId)!
    let registers = 0
    env.setAfterOp(async (op) => {
      if (op === 'inbox/register' && ++registers === 2)
        account.accountPub = deriveAccountSigningKey(random(32)).publicKey
    })
    // Never stuck: the old inbox goes without a successor, and everyone is
    // left.
    expect(await change.run()).toEqual({ done: true })
    env.setAfterOp(null)
    expect(env.fake.inboxes.has(change.oldInboxId)).toBe(false)
    expect(env.fake.successors.has(change.oldInboxId)).toBe(false)
    expect(reconnectEvents(env, anna.inboxId)).toEqual([])
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
    expect(change.skipped).toEqual(['conflict'])
  })

  it('ends without invites once the account has been suspended for a week', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    const account = env.fake.accounts.get(change.accountId)!
    let registers = 0
    env.setAfterOp(async (op) => {
      if (op === 'inbox/register' && ++registers === 2)
        account.status = 'suspended'
    })
    await expect(change.run()).rejects.toMatchObject({ code: 'suspended' })
    env.setAfterOp(null)
    env.advance(SUSPENDED_WAIT_MS - 1)
    await expect(change.run()).rejects.toMatchObject({ code: 'suspended' })
    env.advance(1)
    expect(await change.run()).toEqual({ done: true })
    expect(env.fake.inboxes.has(change.oldInboxId)).toBe(false)
    expect(reconnectEvents(env, anna.inboxId)).toEqual([])
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
    expect(change.skipped).toEqual(['suspended'])
  })

  it('leaves a buddy who reconnected even while another invitation fails', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const buddies = ['Anna', 'Ben'].map((name) => env.user(name))
    for (const buddy of buddies) await pair(mom, buddy)
    const change = await rotate(env, mom)
    // The second invitation's answer never arrives.
    let puts = 0
    env.setAfterOp(async (op) => {
      if (op === 'event/put' && ++puts === 2)
        throw new TypeError('Network request failed')
    })
    await change.run()
    env.setAfterOp(null)
    const sentTo = change.progress()!.former.find((b) => b.sentAt)!.inboxId
    const anna = buddies.find((buddy) => buddy.inboxId === sentTo)!
    const ben = buddies.find((buddy) => buddy !== anna)!
    await anna.engine.sync()
    await anna.engine.acceptReconnect(change.oldInboxId)
    await mom.engine.sync()

    // Ben's invitation fails again.
    env.offlineOps.add('event/put')
    const outcome = await change.carryOn()
    env.offlineOps.clear()
    expect(outcome.done).toBe(false)
    const former = change.progress()!.former
    expect(former.find((b) => b.inboxId === anna.inboxId)!.leftAt).toBeDefined()
    expect(
      former.find((b) => b.inboxId === ben.inboxId)!.sentAt
    ).toBeUndefined()
    // It goes next time, sealed after it.
    await change.carryOn()
    expect(change.sent).toHaveLength(2)
    expect(
      change.progress()!.former.find((b) => b.inboxId === ben.inboxId)!.sealedAt
    ).toBeDefined()
  })

  it('leaves everyone at once, inviting no one, when the old inbox went without a successor', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    // Gone already (the relay wiped it), so nothing can name the new inbox.
    env.fake.inboxes.delete(change.oldInboxId)

    expect(await change.run()).toEqual({ done: true })
    expect(reconnectEvents(env, anna.inboxId)).toEqual([])
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
    expect(change.progress()).toBeNull()
  })

  it('leaves the old pairings at once when the User deletes Buddies', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    expect((await change.run()).done).toBe(false)
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(1)

    await change.leaveNow()
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
    expect(change.progress()).toBeNull()
    expect(await change.carryOn()).toEqual({ done: true })
  })

  it('reconnects a buddy whose list is full', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    for (const name of ['Ben', 'Cara', 'Dan', 'Eve'])
      await pair(env.user(name), anna)
    expect(anna.store.getState().buddies).toHaveLength(5)

    const change = await rotate(env, mom)
    await change.run()
    await anna.engine.sync()
    await anna.engine.acceptReconnect(change.oldInboxId)
    await mom.engine.sync()
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toHaveLength(5)
    expect(
      anna.store.getState().buddies.find((b) => b.inboxId === change.newInboxId)
    ).toMatchObject({ status: 'active' })
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(5)
  })

  it('ends the old pairing when the claim fails after its spot went', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    await change.run()
    await anna.engine.sync()
    const offer = anna.store.getState().reconnectOffers[change.oldInboxId]
    // The invite lapses between Anna's new slot and her claim.
    env.setAfterOp(async (op) => {
      if (op === 'slot/add')
        env.fake.invites.delete(
          deriveInvite(fromB64u(offer.invites[0].secret)).inviteId
        )
    })
    await expect(
      anna.engine.acceptReconnect(change.oldInboxId)
    ).rejects.toEqual(new BuddyInviteError('unavailable'))
    env.setAfterOp(null)
    // Its slot here is gone, so the old pairing ends rather than half-stays.
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
    expect(anna.store.getState().buddies).toEqual([])
  })

  it('links an inbox from before accounts to the account before the change', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    // Registered before accounts: linked to no one.
    env.fake.inboxAccounts.delete(mom.inboxId)

    expect(await prepare(mom)).toBe('linked')
    const accountId = env.fake.inboxAccounts.get(mom.inboxId)
    expect(accountId).toBeDefined()
    // Someone else with the old key can't link it to their account now.
    await expect(linkToThief(env.user('Thief'), mom)).rejects.toMatchObject({
      code: 'conflict',
    })

    const change = await rotate(env, mom)
    expect(change.accountId).toBe(accountId)
    await change.run()
    expect(env.fake.successors.get(change.oldInboxId)?.successor).toBe(
      change.newInboxId
    )
    expect(reconnectEvents(env, anna.inboxId)).toHaveLength(1)
    expect(change.skipped).toEqual([])
  })

  it('has nothing to link for a User who never started Buddies', async () => {
    const env = setup()
    const mom = env.user('Mom')
    expect(await prepare(mom)).toBe('none')
    expect(env.fake.inboxes.size).toBe(0)
  })

  it.each([
    [500, 'internal'],
    [429, 'rate_limited'],
    [503, 'disabled'],
  ])(
    'stops preparing, to try again, when the relay answers %i',
    async (status, error) => {
      const env = setup()
      const mom = env.user('Mom')
      const anna = env.user('Anna')
      await pair(mom, anna)
      env.fake.refusals.set('inbox/sync', { status, error })
      await expect(prepare(mom)).rejects.toBeInstanceOf(RelayError)
    }
  )

  it('invites no one, and leaves at once, when the old inbox was never linked', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    env.fake.inboxAccounts.delete(mom.inboxId)

    const change = await rotate(env, mom)
    expect(await change.run()).toEqual({ done: true })
    expect(reconnectEvents(env, anna.inboxId)).toEqual([])
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
    expect(env.fake.successors.has(change.oldInboxId)).toBe(false)
    expect(change.skipped).toEqual(['forbidden'])
  })

  it('invites no one, and leaves at once, when the old inbox is another account’s', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    env.fake.inboxAccounts.delete(mom.inboxId)
    await linkToThief(env.user('Thief'), mom)

    expect(await prepare(mom)).toBe('otherAccount')
    const change = await rotate(env, mom)
    expect(await change.run()).toEqual({ done: true })
    expect(reconnectEvents(env, anna.inboxId)).toEqual([])
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
    expect(change.skipped).toEqual(['forbidden'])
  })

  it('invites no one, and tries again, while the account is suspended', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    const account = env.fake.accounts.get(change.accountId)!
    // Suspended once the new inbox is linked, before the old one goes.
    let registers = 0
    env.setAfterOp(async (op) => {
      if (op === 'inbox/register' && ++registers === 2)
        account.status = 'suspended'
    })
    await expect(change.run()).rejects.toMatchObject({ code: 'suspended' })
    env.setAfterOp(null)
    expect(env.fake.inboxes.has(change.oldInboxId)).toBe(true)
    expect(reconnectEvents(env, anna.inboxId)).toEqual([])

    account.status = 'active'
    expect((await change.run()).done).toBe(false)
    expect(reconnectEvents(env, anna.inboxId)).toHaveLength(1)
  })

  it('records the successor once even when the answer to deleting was lost', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    let lost = false
    env.setAfterOp(async (op) => {
      if (op !== 'inbox/delete' || lost) return
      lost = true
      throw new TypeError('Network request failed')
    })
    await change.run().catch(() => {})
    env.setAfterOp(null)
    expect(lost).toBe(true)
    expect((await change.run()).done).toBe(false)
    expect(reconnectEvents(env, anna.inboxId)).toHaveLength(1)
    expect(change.skipped).toEqual([])
  })

  it('tries again when the relay can’t reach the old inbox', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    env.fake.refusals.set('inbox/delete', { status: 500, error: 'internal' })
    await expect(change.run()).rejects.toBeInstanceOf(RelayError)
    expect(env.fake.inboxes.has(change.oldInboxId)).toBe(true)
    expect(reconnectEvents(env, anna.inboxId)).toEqual([])

    env.fake.refusals.clear()
    expect((await change.run()).done).toBe(false)
    expect(reconnectEvents(env, anna.inboxId)).toHaveLength(1)
  })

  it('keeps a device left on the old key from bringing the old inbox back', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    await change.run()

    // Anyone with the old key, a device that never got the new one included.
    await expect(
      mom.relay.registerInbox(ownerAuthFor(change.oldKey))
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(env.fake.inboxes.has(change.oldInboxId)).toBe(false)
    expect(await anna.relay.inboxSuccessor(change.oldInboxId)).toBe(
      change.newInboxId
    )
  })

  it('leaves Buddies alone for a User who never started it', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const change = await rotate(env, mom)
    expect(await change.run()).toEqual({ done: true })
    expect(env.fake.inboxes.size).toBe(0)
  })
})

describe('receiving a reconnect invitation', () => {
  /**
   * Writes `body` into `buddy`'s inbox through `writer`'s pairing made with
   * `writer.seed` (the old key, to anyone who kept it). `theirs`: the pairing
   * as `writer` had it, when their device has since let go of it.
   */
  async function forge(
    env: Env,
    writer: User,
    buddy: User,
    body: Record<string, unknown>,
    theirs = writer.store
      .getState()
      .buddies.find((b) => b.inboxId === buddy.inboxId)!
  ) {
    const me = deriveIdentity(writer.seed)
    const pairSecret = derivePairSecret(
      me.dhPrivate,
      fromB64u(theirs.dhPub),
      fromB64u(theirs.inviteSecret),
      me.inboxId,
      buddy.inboxId
    )
    const outgoing = deriveDirection(pairSecret, buddy.inboxId)
    const eventId = toB64u(random(16))
    await writer.relay.putEvent(
      {
        inboxId: buddy.inboxId,
        slotId: outgoing.slotId,
        writerSeed: outgoing.writerSeed,
      },
      {
        eventId,
        kind: 'pair.reconnect',
        blob: seal(
          outgoing.contentKey,
          utf8(JSON.stringify(body)),
          aad.event(buddy.inboxId, outgoing.slotId, eventId),
          random(12)
        ),
        push: false,
      }
    )
  }

  /** An open invite to someone else's inbox, as a forger would offer. */
  async function strangersInvite(env: Env) {
    const stranger = env.user('Eve')
    const link = await stranger.engine.createInvite()
    return {
      stranger,
      secret: link.split('#1')[1],
      invite: () => env.fake.invites.values().next().value!,
    }
  }

  it('waits to reconnect while the account that changed its key is suspended', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    await change.run()
    await anna.engine.sync()
    const account = env.fake.accounts.get(change.accountId)!

    account.status = 'suspended'
    await expect(
      anna.engine.acceptReconnect(change.oldInboxId)
    ).rejects.toEqual(new BuddyInviteError('reconnectUnverified'))
    expect(
      anna.store.getState().reconnectOffers[change.oldInboxId]
    ).toBeDefined()

    account.status = 'active'
    expect(await anna.engine.acceptReconnect(change.oldInboxId)).toEqual({
      claimed: true,
    })
  })

  it('keeps the invitation the relay names when more arrive than fit', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const momsAnna = mom.store.getState().buddies[0]
    // Someone who kept Mom's key offers their own inbox, before and after.
    const eve = await strangersInvite(env)
    const forged = () => ({
      v: 1,
      inboxId: eve.stranger.inboxId,
      secret: eve.secret,
      expiresAt: env.now() + 60_000,
    })
    await forge(env, mom, anna, forged())
    const change = await rotate(env, mom)
    // Until the seal lands (it failed for now), the old key still writes.
    env.fake.refusals.set('slot/seal', { status: 500, error: 'internal' })
    await change.run()
    const others = [env.user('Fay'), env.user('Gus')]
    for (const other of others)
      await forge(
        env,
        mom,
        anna,
        { ...forged(), inboxId: other.inboxId },
        momsAnna
      )
    await anna.engine.sync()
    const offer = anna.store.getState().reconnectOffers[change.oldInboxId]
    // A fourth once the relay names the new inbox: only its invitation stays.
    expect(offer.invites.map((invite) => invite.inboxId)).toEqual([
      change.newInboxId,
    ])
    expect(
      anna.store.getState().notifications.filter((n) => n.kind === 'reconnect')
    ).toHaveLength(1)

    expect(await anna.engine.acceptReconnect(change.oldInboxId)).toEqual({
      claimed: true,
    })
    expect(anna.store.getState().reconnectOffers).toEqual({})
    expect(eve.invite().status).toBe('open')
    await mom.engine.sync()
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: change.newInboxId, status: 'active' },
    ])
  })

  it('keeps the real invitation when three forged ones came first', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    // Someone with Mom's key fills the offer before any change.
    const eve = await strangersInvite(env)
    for (const name of ['Fay', 'Gus', 'Hal'])
      await forge(env, mom, anna, {
        v: 1,
        inboxId: env.user(name).inboxId,
        secret: eve.secret,
        expiresAt: env.now() + 60_000,
      })
    await anna.engine.sync()
    expect(
      anna.store.getState().reconnectOffers[mom.inboxId].invites
    ).toHaveLength(3)

    const change = await rotate(env, mom)
    await change.run()
    await anna.engine.sync()
    // The relay names the new inbox now: only its invitation stays.
    expect(
      anna.store
        .getState()
        .reconnectOffers[change.oldInboxId].invites.map((i) => i.inboxId)
    ).toEqual([change.newInboxId])
    expect(await anna.engine.acceptReconnect(change.oldInboxId)).toEqual({
      claimed: true,
    })
  })

  it('makes room for the newest invitation while the relay names none', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const eve = await strangersInvite(env)
    const inboxes = ['Fay', 'Gus', 'Hal', 'Ida'].map(
      (name) => env.user(name).inboxId
    )
    for (const inboxId of inboxes)
      await forge(env, mom, anna, {
        v: 1,
        inboxId,
        secret: eve.secret,
        expiresAt: env.now() + 60_000,
      })
    await anna.engine.sync()
    expect(
      anna.store
        .getState()
        .reconnectOffers[mom.inboxId].invites.map((i) => i.inboxId)
    ).toEqual(inboxes.slice(1))
  })

  it('keeps one invitation per inbox', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const momsAnna = mom.store.getState().buddies[0]
    const change = await rotate(env, mom)
    // Until the seal lands (it failed for now), the old key still writes.
    env.fake.refusals.set('slot/seal', { status: 500, error: 'internal' })
    await change.run()
    await anna.engine.sync()
    const first = anna.store.getState().reconnectOffers[change.oldInboxId]

    await forge(
      env,
      mom,
      anna,
      {
        v: 1,
        inboxId: change.newInboxId,
        secret: toB64u(random(16)),
        expiresAt: env.now() + 60_000,
      },
      momsAnna
    )
    await anna.engine.sync()
    expect(anna.store.getState().reconnectOffers[change.oldInboxId]).toEqual(
      first
    )
  })

  it('ends the old pairing once an unanswered invitation lapses after the change', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    await change.run()
    // Mom's device never comes back to leave.
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toHaveLength(1)

    env.advance(8 * 24 * 60 * 60 * 1000)
    await anna.engine.sync()
    await anna.engine.sync()
    expect(anna.store.getState().reconnectOffers).toEqual({})
    expect(anna.store.getState().buddies).toEqual([])
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
  })

  it('keeps the pairing when an invitation lapses without a key change', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const eve = await strangersInvite(env)
    await forge(env, mom, anna, {
      v: 1,
      inboxId: eve.stranger.inboxId,
      secret: eve.secret,
      expiresAt: env.now() + 60_000,
    })
    await anna.engine.sync()
    env.advance(8 * 24 * 60 * 60 * 1000)
    await anna.engine.sync()
    await anna.engine.sync()
    expect(anna.store.getState().reconnectOffers).toEqual({})
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: mom.inboxId, status: 'active' },
    ])
  })

  it('ends the old pairing when a write finds the old inbox gone', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    // The old inbox is gone, and no invitation ever went out.
    env.offlineOps.add('event/put')
    await change.run().catch(() => {})
    env.offlineOps.delete('event/put')

    // Anna's next card goes to the old inbox, and finds it gone.
    anna.profile.name = 'Anna B.'
    await anna.engine.publishCards()
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toEqual([])
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
  })

  it('won’t reconnect until the relay names the offered inbox as the successor', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    // No key change: someone with Mom's key offers their own inbox.
    const eve = await strangersInvite(env)
    await forge(env, mom, anna, {
      v: 1,
      inboxId: eve.stranger.inboxId,
      secret: eve.secret,
      expiresAt: env.now() + 60_000,
    })
    await anna.engine.sync()
    expect(anna.store.getState().reconnectOffers[mom.inboxId]).toBeDefined()

    await expect(anna.engine.acceptReconnect(mom.inboxId)).rejects.toEqual(
      new BuddyInviteError('reconnectUnverified')
    )
    // Kept for later; nothing claimed, and Mom is still her buddy.
    expect(anna.store.getState().reconnectOffers[mom.inboxId]).toBeDefined()
    expect(eve.invite().status).toBe('open')
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: mom.inboxId, status: 'active' },
    ])
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(1)
  })

  it('drops an offer when the relay names another inbox as the successor', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const momsAnna = mom.store.getState().buddies[0]
    const change = await rotate(env, mom)
    // The real invitation never reaches Anna; a forged one does.
    env.offlineOps.add('event/put')
    await change.run().catch(() => {})
    env.offlineOps.delete('event/put')
    const eve = await strangersInvite(env)
    await forge(
      env,
      mom,
      anna,
      {
        v: 1,
        inboxId: eve.stranger.inboxId,
        secret: eve.secret,
        expiresAt: env.now() + 60_000,
      },
      momsAnna
    )
    await anna.engine.sync()

    await expect(
      anna.engine.acceptReconnect(change.oldInboxId)
    ).rejects.toEqual(new BuddyInviteError('invalid'))
    expect(anna.store.getState().reconnectOffers).toEqual({})
    expect(eve.invite().status).toBe('open')
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: change.oldInboxId, status: 'active' },
    ])

    // The real invitation, once it arrives, still reconnects her.
    await change.run()
    await anna.engine.sync()
    expect(await anna.engine.acceptReconnect(change.oldInboxId)).toEqual({
      claimed: true,
    })
  })

  it('refuses an invitation that leads somewhere else than it said', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const momsAnna = mom.store.getState().buddies[0]
    const change = await rotate(env, mom)
    env.offlineOps.add('event/put')
    await change.run().catch(() => {})
    env.offlineOps.delete('event/put')
    // The successor the relay names, but someone else's invite.
    const eve = await strangersInvite(env)
    await forge(
      env,
      mom,
      anna,
      {
        v: 1,
        inboxId: change.newInboxId,
        secret: eve.secret,
        expiresAt: env.now() + 60_000,
      },
      momsAnna
    )
    await anna.engine.sync()
    await expect(
      anna.engine.acceptReconnect(change.oldInboxId)
    ).rejects.toEqual(new BuddyInviteError('invalid'))
    // Mom is still her buddy, and nothing was claimed.
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: change.oldInboxId, status: 'active' },
    ])
    expect(eve.invite().status).toBe('open')
  })

  it('takes one only to a new inbox', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const expiresAt = env.now() + 1000
    const secret = toB64u(random(16))
    await forge(env, mom, anna, {
      v: 1,
      inboxId: mom.inboxId,
      secret,
      expiresAt,
    })
    await forge(env, mom, anna, {
      v: 1,
      inboxId: anna.inboxId,
      secret,
      expiresAt,
    })
    await anna.engine.sync()
    expect(anna.store.getState().reconnectOffers).toEqual({})
  })

  it('ignores one from someone who is not a buddy', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    // Anna removes Mom first; Mom's old slot is gone, so nothing lands.
    await anna.engine.removeBuddy(mom.inboxId)
    await expect(
      forge(env, mom, anna, {
        v: 1,
        inboxId: deriveIdentity(random(32)).inboxId,
        secret: toB64u(random(16)),
        expiresAt: env.now() + 1000,
      })
    ).rejects.toMatchObject({ code: 'gone' })
    await anna.engine.sync()
    expect(anna.store.getState().reconnectOffers).toEqual({})
  })

  it('passes over an invitation the User dismisses', async () => {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    await change.run()
    await anna.engine.sync()
    const entry = anna.store
      .getState()
      .notifications.find((n) => n.kind === 'reconnect')!
    anna.engine.dismissNotification(entry.id)
    expect(anna.store.getState().reconnectOffers).toEqual({})
    // The old pairing ends with it: nothing more comes through it.
    expect(anna.store.getState().buddies).toEqual([])
    await anna.engine.sync()
    expect(
      anna.store.getState().notifications.some((n) => n.kind === 'reconnect')
    ).toBe(false)
    expect(env.fake.inboxes.get(anna.inboxId)!.slots.size).toBe(0)
  })
})

describe('an owner key the relay refuses after a key change', () => {
  /** The inboxes `inbox/register` was sent for since `from`. */
  const registered = (env: Env, from: number) =>
    env.fake.requests
      .slice(from)
      .filter((request) => request.op === 'inbox/register')
      .map(
        (request) =>
          JSON.parse(
            fromUtf8(fromB64u((request.body as { payload: string }).payload))
          ).inboxId as string
      )

  /** Mom and Anna, paired; then Mom's account key changes elsewhere. */
  async function changedElsewhere(extra: Parameters<Env['user']>[3] = {}) {
    const env = setup()
    const mom = env.user('Mom', undefined, undefined, extra)
    const anna = env.user('Anna')
    await pair(mom, anna)
    const oldInboxId = mom.inboxId
    const accountId = await mom.sessions.withSession(
      async (_, session) => session.accountId
    )
    const newKey = random(32)
    env.fake.accounts.get(accountId)!.accountPub =
      deriveAccountSigningKey(newKey).publicKey
    return { env, mom, anna, oldInboxId, newKey }
  }

  it('drops that inbox, and moves to the new key’s inbox when this device holds it', async () => {
    const { env, mom, oldInboxId, newKey } = await changedElsewhere()
    const from = env.fake.requests.length
    mom.setRootSeed(newKey)
    expect(await mom.engine.ownerKeyRefused(oldInboxId)).toBe('moved')
    expect(mom.store.getState().registeredInboxId).toBeNull()
    expect(mom.store.getState().buddies).toEqual([])
    expect(mom.engine.alertContext()).toBeNull()
    await mom.engine.sync()
    expect(mom.store.getState().registeredInboxId).toBe(
      deriveIdentity(newKey).inboxId
    )
    expect(registered(env, from)).not.toContain(oldInboxId)
  })

  it('drops that inbox, and says the key retired when this device holds the old one', async () => {
    const { mom, oldInboxId } = await changedElsewhere()
    expect(await mom.engine.ownerKeyRefused(oldInboxId)).toBe('retired')
    expect(mom.store.getState().registeredInboxId).toBeNull()
    expect(mom.store.getState().buddies).toEqual([])
    expect(mom.engine.alertContext()).toBeNull()
  })

  it('never registers a refused inbox again, after a relaunch too', async () => {
    const { env, mom, oldInboxId } = await changedElsewhere()
    expect(await mom.engine.ownerKeyRefused(oldInboxId)).toBe('retired')
    expect(mom.store.getState().refusedInboxIds).toEqual([oldInboxId])
    // What's kept in memory goes with a relaunch; the store stays.
    mom.engine.dropIdentity()
    const from = env.fake.requests.length
    await expect(mom.engine.sync()).rejects.toEqual(
      new RelayError('cancelled', 0)
    )
    await expect(mom.engine.ensureInbox()).rejects.toEqual(
      new RelayError('cancelled', 0)
    )
    expect(env.fake.requests.length).toBe(from)
  })

  it('keeps the refusal when Buddies’ data is reset', async () => {
    const { mom, oldInboxId, newKey } = await changedElsewhere()
    expect(await mom.engine.ownerKeyRefused(oldInboxId)).toBe('retired')
    mom.setRootSeed(newKey)
    mom.engine.dropIdentity()
    await mom.engine.sync()
    await mom.engine.leaveThisDevice()
    expect(mom.store.getState().refusedInboxIds).toEqual([oldInboxId])
  })

  it('leaves an inbox this device already moved on from alone', async () => {
    const { mom, oldInboxId } = await changedElsewhere()
    const buddies = mom.store.getState().buddies
    expect(await mom.engine.ownerKeyRefused(random(16).join(''))).toBe(
      'ignored'
    )
    expect(mom.store.getState().registeredInboxId).toBe(oldInboxId)
    expect(mom.store.getState().buddies).toEqual(buddies)
  })

  it('waits while a key change on this device still needs the pairings', async () => {
    let paused = false
    const { mom, oldInboxId, newKey } = await changedElsewhere({
      paused: async () => paused,
    })
    mom.setRootSeed(newKey)
    paused = true
    const buddies = mom.store.getState().buddies
    expect(await mom.engine.ownerKeyRefused(oldInboxId)).toBe('later')
    expect(mom.store.getState().registeredInboxId).toBe(oldInboxId)
    expect(mom.store.getState().buddies).toEqual(buddies)
  })
})

describe('sealing the old pairings', () => {
  /**
   * What anyone who kept `writer`'s old key can do with their slot in `buddy`'s
   * inbox, through `through`'s relay client (a session on an account of their
   * own). `theirs`: the pairing as `writer` had it.
   */
  function oldWriter(
    fake: Env['fake'],
    through: User,
    writer: User,
    buddy: User,
    theirs: Buddy
  ) {
    const me = deriveIdentity(writer.seed)
    const outgoing = deriveDirection(
      derivePairSecret(
        me.dhPrivate,
        fromB64u(theirs.dhPub),
        fromB64u(theirs.inviteSecret),
        me.inboxId,
        buddy.inboxId
      ),
      buddy.inboxId
    )
    const auth = {
      inboxId: buddy.inboxId,
      slotId: outgoing.slotId,
      writerSeed: outgoing.writerSeed,
    }
    return {
      slotId: outgoing.slotId,
      slot: () => fake.inboxes.get(buddy.inboxId)?.slots.get(auth.slotId),
      put: () => {
        const eventId = toB64u(random(16))
        return through.relay.putEvent(auth, {
          eventId,
          kind: 'pair.reconnect',
          blob: seal(
            outgoing.contentKey,
            utf8(JSON.stringify({ v: 1 })),
            aad.event(buddy.inboxId, outgoing.slotId, eventId),
            random(12)
          ),
          push: false,
        })
      },
      seal: () => through.relay.sealSlot(auth),
      leave: () => through.relay.leaveSlot(auth),
    }
  }
  async function paired() {
    const e = setup()
    const mom = e.user('Mom')
    const anna = e.user('Anna')
    const thief = e.user('Thief')
    await pair(mom, anna)
    const momsAnna = mom.store.getState().buddies[0]
    return {
      env: e,
      mom,
      anna,
      thief,
      old: () => oldWriter(e.fake, thief, mom, anna, momsAnna),
    }
  }

  it('seals each slot right after its invite, so the old key writes nothing more', async () => {
    const { env: e, mom, anna, old } = await paired()
    const change = await rotate(e, mom)
    expect((await change.run()).done).toBe(false)
    const [former] = change.progress()!.former
    expect(former.sentAt).toBeDefined()
    expect(former.sealedAt).toBe(e.now())
    expect(old().slot()?.sealed).toBe(true)
    // Through a session on another account, as anyone who kept the key could.
    await expect(old().put()).rejects.toEqual(new RelayError('sealed', 403))
    // Still there for the leave, after the claim or a day.
    expect(old().slot()).toBeDefined()

    // A sealed slot is no error to the buddy: the pairing just writes no more.
    expect(await anna.engine.sync()).toBe('synced')
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: change.oldInboxId, status: 'active' },
    ])
    expect(
      anna.store.getState().reconnectOffers[change.oldInboxId]
    ).toBeDefined()
  })

  it('keeps the invite when the old key leaves the sealed slot first', async () => {
    const { env: e, mom, anna, old } = await paired()
    const change = await rotate(e, mom)
    await change.run()
    await old().leave()
    expect(old().slot()).toBeUndefined()

    await anna.engine.sync()
    expect(anna.store.getState().buddies).toEqual([])
    expect(
      anna.store.getState().reconnectOffers[change.oldInboxId]
    ).toMatchObject({ invites: [{ inboxId: change.newInboxId }] })
    expect(
      anna.store.getState().notifications.filter((n) => n.kind === 'reconnect')
    ).toHaveLength(1)
    expect(await anna.engine.acceptReconnect(change.oldInboxId)).toEqual({
      claimed: true,
    })
    await mom.engine.sync()
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: change.newInboxId, status: 'active' },
    ])
    expect(await change.carryOn()).toEqual({ done: true })
  })

  it('treats a slot the old key sealed first as done, and that buddy gets no invite', async () => {
    const { env: e, mom, anna, old } = await paired()
    await old().seal()
    const change = await rotate(e, mom)
    // Nothing to wait for: the pairing is left at once.
    expect(await change.run()).toEqual({ done: true })
    expect(change.notSent).toEqual(['sealed'])
    expect(change.sent).toEqual([])
    await anna.engine.sync()
    expect(anna.store.getState().reconnectOffers).toEqual({})
    // Its invite doesn't hold room on the new inbox.
    expect(mom.store.getState().outgoingInvites).toEqual([])
  })

  it('seals anyway when the invite write keeps failing, and that buddy gets no invite', async () => {
    const { env: e, mom, old } = await paired()
    e.fake.refusals.set('event/put', { status: 429, error: 'rate_limited' })
    const change = await rotate(e, mom)
    let outcome = await change.run()
    for (let tries = 1; tries < 3; tries++) {
      expect(old().slot()?.sealed).toBeUndefined()
      expect(outcome).toMatchObject({ done: false })
      e.advance(5 * 60 * 1000)
      outcome = await change.carryOn()
    }
    expect(outcome).toEqual({ done: true })
    expect(change.notSent).toEqual(['failed'])
    expect(change.sent).toEqual([])
    expect(mom.store.getState().outgoingInvites).toEqual([])
  })

  it('doesn’t count being offline as the invite write failing', async () => {
    const { env: e, mom, old } = await paired()
    const change = await rotate(e, mom)
    e.offlineOps.add('event/put')
    for (let tries = 0; tries < 4; tries++) {
      await (tries === 0 ? change.run() : change.carryOn()).catch(() => null)
      e.advance(5 * 60 * 1000)
    }
    expect(change.notSent).toEqual([])
    expect(old().slot()?.sealed).toBeUndefined()
    e.offlineOps.delete('event/put')
    await change.carryOn()
    expect(change.sent).toHaveLength(1)
    expect(old().slot()?.sealed).toBe(true)
  })

  it('ends a pairing quietly on a device that still writes through a sealed slot', async () => {
    // Mom's other device, still on the old key, while this one sealed.
    const { env: e, mom, anna } = await paired()
    const momsAnna = mom.store.getState().buddies[0]
    await oldWriter(e.fake, mom, mom, anna, momsAnna).seal()
    mom.profile.name = 'Mother'
    await expect(mom.engine.publishCards()).resolves.not.toThrow()
    expect(mom.store.getState().buddies).toEqual([])
    expect(mom.store.getState().pendingRemovals).toMatchObject([
      { inboxId: anna.inboxId },
    ])
  })

  it('seals again on the next try when sealing failed', async () => {
    const { env: e, mom, old } = await paired()
    e.fake.refusals.set('slot/seal', { status: 500, error: 'internal' })
    const change = await rotate(e, mom)
    const outcome = await change.run()
    expect(change.sent).toHaveLength(1)
    expect(old().slot()?.sealed).toBeUndefined()
    expect(outcome).toEqual({ done: false, retryAt: e.now() + 5 * 60 * 1000 })
    e.fake.refusals.delete('slot/seal')
    e.advance(5 * 60 * 1000)
    await change.carryOn()
    expect(old().slot()?.sealed).toBe(true)
    expect(change.sent).toHaveLength(1)
  })
})

describe('showing a reconnect', () => {
  async function offered() {
    const env = setup()
    const mom = env.user('Mom')
    const anna = env.user('Anna')
    await pair(mom, anna)
    const change = await rotate(env, mom)
    await change.run()
    await anna.engine.sync()
    return { env, mom, anna, change }
  }

  it('lists each offer, with the pairing while it lasts and without it after', async () => {
    const { env, anna, change } = await offered()
    expect(pendingReconnects(anna.store.getState(), env.now())).toMatchObject([
      {
        from: change.oldInboxId,
        offer: { name: 'Mom' },
        buddy: { inboxId: change.oldInboxId },
      },
    ])
    // The old key left the sealed slot: the pairing goes, the offer stays.
    anna.store.setState((state) => ({
      buddies: state.buddies.filter((b) => b.inboxId !== change.oldInboxId),
    }))
    const [listed] = pendingReconnects(anna.store.getState(), env.now())
    expect(listed.from).toBe(change.oldInboxId)
    expect(listed.buddy).toBeUndefined()
    // A lapsed one isn't listed.
    env.advance(8 * 24 * 60 * 60 * 1000)
    expect(pendingReconnects(anna.store.getState(), env.now())).toEqual([])
  })

  it('puts an offer back in the bell when its entry was lost', async () => {
    const { env, anna, change } = await offered()
    const [entry] = anna.store
      .getState()
      .notifications.filter((n) => n.kind === 'reconnect')
    anna.store.setState({ notifications: [] })
    const requeued = withPendingInvitesQueued(anna.store.getState(), env.now())
    expect(requeued).toMatchObject([
      {
        id: entry.id,
        kind: 'reconnect',
        reconnect: change.oldInboxId,
        name: 'Mom',
        read: false,
      },
    ])
    // Listed once.
    anna.store.setState({ notifications: requeued })
    expect(
      withPendingInvitesQueued(anna.store.getState(), env.now())
    ).toHaveLength(1)
  })

  it('keeps an offer’s bell entry when the queue is full', async () => {
    const { env, anna } = await offered()
    const state = anna.store.getState()
    const [entry] = state.notifications.filter((n) => n.kind === 'reconnect')
    const news = Array.from({ length: MAX_NOTIFICATIONS }, (_, index) => ({
      id: `news-${index}`,
      kind: 'paired' as const,
      at: env.now() + index + 1,
      read: false,
      name: 'Ben',
    }))
    const capped = cappedQueue([...news, { ...entry, at: 0 }], state, env.now())
    expect(capped).toHaveLength(MAX_NOTIFICATIONS)
    expect(capped.some((n) => n.id === entry.id)).toBe(true)
  })

  it('dismisses an offer from the list or the buddy, ending the old pairing', async () => {
    const { anna, change } = await offered()
    anna.engine.dismissReconnect(change.oldInboxId)
    const state = anna.store.getState()
    expect(state.reconnectOffers).toEqual({})
    expect(state.notifications.filter((n) => n.kind === 'reconnect')).toEqual(
      []
    )
    expect(state.buddies).toEqual([])
    expect(state.pendingRemovals).toMatchObject([
      { inboxId: change.oldInboxId },
    ])
  })
})

describe('how buddies see the User through a key change', () => {
  /** Mom, who chose the name buddies see, paired with Anna. */
  async function named() {
    const env = setup()
    const mom = env.user('Verify')
    const anna = env.user('Anna')
    mom.engine.setCardName('Ana Lopes')
    await pair(mom, anna)
    expect(anna.store.getState().buddies[0].name).toBe('Ana Lopes')
    return { env, mom, anna }
  }

  it('keeps the name the User chose on the new inbox, and buddies see it after reconnecting', async () => {
    const { env, mom, anna } = await named()
    const chosen = mom.store.getState().cardName
    const change = await rotate(env, mom)
    await change.run()
    expect(mom.store.getState().cardName).toEqual(chosen)
    // Kept through a crash too: the step saved it.
    expect(change.progress()!.cardName).toEqual(chosen)

    await anna.engine.sync()
    await anna.engine.acceptReconnect(change.oldInboxId)
    await mom.engine.sync()
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: change.newInboxId, name: 'Ana Lopes' },
    ])
    expect(anna.store.getState().cards[change.newInboxId]?.name).toBe(
      'Ana Lopes'
    )
  })

  it('takes the name from the old roster when this device never kept one', async () => {
    const { env, mom } = await named()
    const chosen = mom.store.getState().cardName
    // Another device of Mom's chose it; this one only had the roster.
    mom.store.setState({ cardName: null })
    const change = await rotate(env, mom)
    await change.run()
    expect(mom.store.getState().cardName).toEqual(chosen)
  })

  it('puts the name back on resume after the app is killed mid-change', async () => {
    const { env, mom } = await named()
    const chosen = mom.store.getState().cardName
    const change = await rotate(env, mom)
    let killed = false
    env.setAfterOp(async (op) => {
      if (op !== 'inbox/delete' || killed) return
      killed = true
      throw new Error('killed')
    })
    await change.run().catch(() => {})
    env.setAfterOp(null)
    expect(killed).toBe(true)
    // A sync between the launches let go of what was kept for the old inbox.
    mom.store.setState({ cardName: null })
    await change.run()
    expect(mom.store.getState().cardName).toEqual(chosen)
    // And after any later sync that dropped it, the next carry-on restores it.
    mom.store.setState({ cardName: null })
    await change.carryOn()
    expect(mom.store.getState().cardName).toEqual(chosen)
  })

  it('keeps a newer name the User chose after the change', async () => {
    const { env, mom } = await named()
    const change = await rotate(env, mom)
    await change.run()
    env.advance(1000)
    mom.engine.setCardName('Ana L.')
    await change.carryOn()
    expect(mom.store.getState().cardName?.name).toBe('Ana L.')
  })

  it('keeps the shrunk Profile photo cards carry', async () => {
    const { env, mom } = await named()
    const thumbnail = { source: 'file:///photo.jpg', data: 'AAAA' }
    mom.store.setState({ avatarThumbnail: thumbnail })
    const change = await rotate(env, mom)
    await change.run()
    expect(mom.store.getState().avatarThumbnail).toEqual(thumbnail)
  })
})
