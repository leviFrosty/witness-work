import { describe, expect, it, vi } from 'vitest'
import {
  concatBytes,
  fromB64u,
  fromUtf8,
  toB64u,
  utf8,
} from '@/features/buddies/lib/bytes'
import { ed25519Verify, sha256 } from '@/features/buddies/lib/crypto'
import {
  deriveDirection,
  deriveIdentity,
  derivePairSecret,
} from '@/features/buddies/lib/keys'
import {
  createRelayClient,
  type LiveSocket,
  RelayError,
} from '@/features/buddies/lib/relay'
import {
  ownerAuthFor,
  pair,
  random,
  RELAY_URL,
  setup,
} from '@/features/buddies/lib/testing/engineHarness'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import { AccountSessionError } from '@/lib/serverAccount/session'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

type Harness = ReturnType<typeof setup>

const decode = (b64u: string) =>
  JSON.parse(fromUtf8(fromB64u(b64u))) as Record<string, unknown>

function lastRequest(h: Harness, op: string) {
  const found = h.fake.requests.findLast((request) => request.op === op)
  if (!found) throw new Error(`no ${op} request`)
  return found
}

const accountIdOf = (h: Harness, seed: Uint8Array) =>
  [...h.fake.accounts].find(
    ([, account]) =>
      account.accountPub === deriveAccountSigningKey(seed).publicKey
  )?.[0]

const verifies = (
  op: string,
  envelope: { payload: string; signature: string },
  publicKey: string
) =>
  ed25519Verify(
    fromB64u(envelope.signature),
    concatBytes(utf8(`ww-buddies/v1\n${op}\n`), fromB64u(envelope.payload)),
    fromB64u(publicKey)
  )

async function paired() {
  const h = setup()
  const mom = h.user('Mom')
  const anna = h.user('Anna')
  await pair(mom, anna)
  const me = deriveIdentity(mom.seed)
  const buddy = mom.store.getState().buddies[0]
  const outgoing = deriveDirection(
    derivePairSecret(
      me.dhPrivate,
      fromB64u(buddy.dhPub),
      fromB64u(buddy.inviteSecret),
      me.inboxId,
      buddy.inboxId
    ),
    anna.inboxId
  )
  return { h, mom, anna, outgoing }
}

describe('requests with a session', () => {
  it('registers with the owner envelope and the claim for the session account', async () => {
    const h = setup()
    const ann = h.user('Ann')
    await ann.engine.ensureInbox()
    const { headers, body } = lastRequest(h, 'inbox/register')
    expect(headers.authorization).toMatch(/^Bearer access-/)
    const envelope = body as { payload: string; signature: string }
    expect(Object.keys(envelope).sort()).toEqual(['payload', 'signature'])
    const me = deriveIdentity(ann.seed)
    expect(verifies('inbox/register', envelope, me.ownerPub)).toBe(true)
    const payload = decode(envelope.payload)
    expect(payload).toMatchObject({
      inboxId: me.inboxId,
      ownerPub: me.ownerPub,
      account: { accountId: accountIdOf(h, ann.seed) },
    })
    expect(payload).toHaveProperty('ts')
    expect(payload).toHaveProperty('nonce')
  })

  it('sends owner ops as plain JSON, unsigned', async () => {
    const h = setup()
    const ann = h.user('Ann')
    const owner = ownerAuthFor(ann.seed)
    await ann.engine.ensureInbox()
    const calls: [string, () => Promise<unknown>][] = [
      ['inbox/sync', () => ann.relay.syncInbox(owner, 0)],
      [
        'device/register',
        () =>
          ann.relay.registerDevice(owner, {
            deviceId: toB64u(random(16)),
            apnsToken: 'ab'.repeat(32),
            apnsEnvironment: 'sandbox',
            templates: {},
          }),
      ],
      [
        'device/unregister',
        () => ann.relay.unregisterDevice(owner, 'd'.repeat(22)),
      ],
      [
        'slot/add',
        () => ann.relay.addSlot(owner, 's'.repeat(22), 'w'.repeat(43)),
      ],
      ['slot/remove', () => ann.relay.removeSlot(owner, 's'.repeat(22))],
      ['roster/put', () => ann.relay.putRoster(owner, 'AQ')],
      [
        'invite/create',
        () =>
          ann.relay.createInvite(owner, {
            inviteId: 'i'.repeat(22),
            claimVerifier: 'v'.repeat(43),
            blob: 'AQ',
            expiresAt: h.now() + 60_000,
          }),
      ],
      ['invite/delete', () => ann.relay.deleteInvite(owner, 'i'.repeat(22))],
      ['blob/delete', () => ann.relay.deleteBlobs(owner, ['b'.repeat(43)])],
      ['inbox/delete', () => ann.relay.deleteInbox(owner)],
    ]
    for (const [op, call] of calls) {
      await call()
      const { headers, body } = lastRequest(h, op)
      expect(headers.authorization, op).toMatch(/^Bearer access-/)
      const fields = body as Record<string, unknown>
      expect(fields.inboxId, op).toBe(ann.inboxId)
      for (const absent of ['payload', 'signature', 'p', 's', 'ts', 'nonce'])
        expect(fields, `${op} ${absent}`).not.toHaveProperty(absent)
    }
    expect(lastRequest(h, 'inbox/sync').body).toEqual({
      inboxId: ann.inboxId,
      since: 0,
    })
  })

  it('puts a shared photo with its fields in a header and no signature', async () => {
    const { h, mom } = await paired()
    const data = random(64)
    const blobId = toB64u(sha256(data))
    const readTokenHash = toB64u(sha256(random(32)))
    const expiresAt = h.now() + 24 * 60 * 60 * 1000
    await mom.relay.putBlob(ownerAuthFor(mom.seed), {
      blobId,
      data,
      expiresAt,
      readTokenHash,
    })
    const { headers, body } = lastRequest(h, 'blob/put')
    expect(headers.authorization).toMatch(/^Bearer access-/)
    expect(headers['content-type']).toBe('application/octet-stream')
    expect(headers).not.toHaveProperty('x-buddies-signature')
    expect(headers).not.toHaveProperty('x-buddies-s')
    expect(decode(headers['x-buddies-payload'])).toEqual({
      inboxId: mom.inboxId,
      blobId,
      bytes: 64,
      expiresAt,
      readTokenHash,
    })
    expect(body).toEqual(data)
  })

  it('signs writer ops with the slot key, beside the session', async () => {
    const { h, mom, anna, outgoing } = await paired()
    const auth = {
      inboxId: anna.inboxId,
      slotId: outgoing.slotId,
      writerSeed: outgoing.writerSeed,
    }
    await mom.relay.putCard(auth, 'AQ')
    await mom.relay.putEvent(auth, {
      eventId: toB64u(random(16)),
      kind: 'share.reply',
      blob: 'AQ',
      push: false,
    })
    await mom.relay.leaveSlot(auth)
    for (const op of ['card/put', 'event/put', 'slot/leave']) {
      const { headers, body } = lastRequest(h, op)
      expect(headers.authorization, op).toMatch(/^Bearer access-/)
      const envelope = body as { payload: string; signature: string }
      expect(Object.keys(envelope).sort(), op).toEqual(['payload', 'signature'])
      expect(verifies(op, envelope, outgoing.writerPub), op).toBe(true)
      expect(decode(envelope.payload), op).toMatchObject({
        inboxId: anna.inboxId,
        slotId: outgoing.slotId,
      })
    }
  })

  it('sends invites and photo reads as their unsigned payload', async () => {
    const h = setup()
    const ann = h.user('Ann')
    const ben = h.user('Ben')
    const inviteId = 'i'.repeat(22)
    await ben.relay.fetchInvite(inviteId).catch(() => {})
    await ben.relay.claimInvite(inviteId, 'c'.repeat(43), 'AQ').catch(() => {})
    const ref = { inboxId: ann.inboxId, blobId: 'b'.repeat(43), token: 't' }
    await ben.relay.getBlob(ref).catch(() => {})
    for (const [op, fields] of [
      ['invite/fetch', { inviteId }],
      ['invite/claim', { inviteId, claimSecret: 'c'.repeat(43), blob: 'AQ' }],
      ['blob/get', ref],
    ] as const) {
      const { headers, body } = lastRequest(h, op)
      expect(headers.authorization, op).toMatch(/^Bearer access-/)
      const envelope = body as { payload: string }
      expect(Object.keys(envelope), op).toEqual(['payload'])
      expect(decode(envelope.payload), op).toEqual(fields)
    }
  })

  it('opens the live signal with the session and inbox in headers, not the URL', async () => {
    const h = setup()
    const ann = h.user('Ann')
    const opened: { url: string; headers: Record<string, string> }[] = []
    const client = createRelayClient({
      baseUrl: RELAY_URL,
      randomBytes: random,
      authorize: (run, { signal }) => ann.sessions.withSession(run, { signal }),
      fetchImpl: h.fetchImpl,
      openSocket: (url, headers) => {
        opened.push({ url, headers })
        return {} as LiveSocket
      },
    })
    await client.openLive(ownerAuthFor(ann.seed))
    const [{ url, headers }] = opened
    expect(url).toBe('wss://relay.test/buddies/v1/inbox/live')
    expect(url).not.toContain(ann.inboxId)
    expect(Object.keys(headers).sort()).toEqual([
      'authorization',
      'x-buddies-payload',
    ])
    expect(headers.authorization).toMatch(/^Bearer access-/)
    expect(decode(headers['x-buddies-payload'])).toEqual({
      inboxId: ann.inboxId,
    })

    h.advance(15 * 60 * 1000)
    await client.openLive(ownerAuthFor(ann.seed))
    expect(opened[1].headers.authorization).toMatch(/^Bearer access-/)
    expect(opened[1].headers.authorization).not.toBe(headers.authorization)
    expect(h.fake.sessions.size).toBe(1)
  })

  it('re-signs a writer op sent again after its token was refused', async () => {
    const { h, mom, anna, outgoing } = await paired()
    h.fake.expireAccessTokens()
    const before = h.fake.requests.length
    await mom.relay.putCard(
      {
        inboxId: anna.inboxId,
        slotId: outgoing.slotId,
        writerSeed: outgoing.writerSeed,
      },
      'AQ'
    )
    const [refused, sent] = h.fake.requests.slice(before)
    expect(refused.op).toBe('card/put')
    expect(sent.op).toBe('card/put')
    expect(sent.headers.authorization).not.toBe(refused.headers.authorization)
    const nonceOf = (body: unknown) =>
      decode((body as { payload: string }).payload).nonce
    expect(nonceOf(sent.body)).not.toBe(nonceOf(refused.body))
  })
})

describe('an inbox from before accounts', () => {
  it('is linked with inbox/register, and the owner op sent once more', async () => {
    const h = setup()
    const ann = h.user('Ann')
    await ann.engine.ensureInbox()
    h.fake.inboxAccounts.delete(ann.inboxId)
    const before = h.fake.requests.length
    await ann.relay.syncInbox(ownerAuthFor(ann.seed), 0)
    expect(h.fake.requests.slice(before).map((request) => request.op)).toEqual([
      'inbox/sync',
      'inbox/register',
      'inbox/sync',
    ])
    expect(h.fake.inboxAccounts.get(ann.inboxId)).toBe(accountIdOf(h, ann.seed))
  })

  it('tries the link once, then gives up with the answer', async () => {
    const answers = ['not_linked', 'ok', 'not_linked']
    const ops: string[] = []
    const client = createRelayClient({
      baseUrl: RELAY_URL,
      randomBytes: random,
      authorize: (run) => run('Bearer token', { accountId: 'a'.repeat(22) }),
      fetchImpl: (async (url: string) => {
        ops.push(String(url).split('/buddies/v1/')[1])
        const answer = answers.shift()
        return answer === 'ok'
          ? new Response(JSON.stringify({ ok: true }), { status: 200 })
          : new Response(JSON.stringify({ ok: false, error: answer }), {
              status: 409,
            })
      }) as typeof fetch,
    })
    await expect(client.syncInbox(ownerAuthFor(random(32)), 0)).rejects.toEqual(
      new RelayError('not_linked', 409)
    )
    expect(ops).toEqual(['inbox/sync', 'inbox/register', 'inbox/sync'])
  })
})

describe('without a session', () => {
  const failing = (error: AccountSessionError) => {
    const fetchImpl = vi.fn()
    const client = createRelayClient({
      baseUrl: RELAY_URL,
      randomBytes: random,
      authorize: async () => {
        throw error
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      openSocket: vi.fn(),
    })
    return { client, fetchImpl }
  }

  it('sends no request, and says why as a relay error', async () => {
    const cases: [AccountSessionError, RelayError][] = [
      [new AccountSessionError('offline'), new RelayError('network', 0)],
      [new AccountSessionError('cancelled'), new RelayError('cancelled', 0)],
      [
        new AccountSessionError('attestation', { attestation: 'device' }),
        new RelayError('unverified', 0, 30 * 60 * 1000, 'device'),
      ],
      [
        new AccountSessionError('upgrade', { status: 426 }),
        new RelayError('upgrade_required', 426),
      ],
      [
        new AccountSessionError('unavailable', {
          status: 503,
          serverCode: 'disabled',
        }),
        new RelayError('disabled', 503),
      ],
      [
        new AccountSessionError('rateLimited', {
          status: 429,
          retryAfterMs: 60_000,
        }),
        new RelayError('rate_limited', 429, 60_000),
      ],
    ]
    for (const [error, expected] of cases) {
      const { client, fetchImpl } = failing(error)
      const owner = ownerAuthFor(random(32))
      await expect(client.syncInbox(owner, 0)).rejects.toEqual(expected)
      await expect(client.fetchInvite('i'.repeat(22))).rejects.toEqual(expected)
      await expect(client.openLive(owner)).rejects.toEqual(expected)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })
})
