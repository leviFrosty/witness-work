import { createCipheriv, createDecipheriv } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { base64ToBytes } from '../crypto'
import type { BuddiesSignedOp } from './contracts'
import {
  DAY_MS,
  SigningKey,
  b64u,
  createHarness,
  hexToken,
  randomBytes,
  randomId,
  unsignedEnvelope,
  relayError,
  type Harness,
} from '../test/buddies'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: DurableObjectState
    env: unknown
    constructor(ctx: DurableObjectState, env: unknown) {
      this.ctx = ctx
      this.env = env
    }
  },
}))

/**
 * Two synthetic clients pair through the relay exactly as the protocol's
 * "Pairing sequence" describes, using the client cryptography it specifies
 * (HKDF-SHA256, X25519, Ed25519, ChaCha20-Poly1305). The relay only ever sees
 * ciphertext, ids, and public keys.
 */

const utf8 = (text: string) => new TextEncoder().encode(text)
const EMPTY = new Uint8Array(0)

const hkdf = async (
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  length: number
) => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) },
    key,
    length * 8
  )
  return new Uint8Array(bits)
}

/** X25519 key pair from a 32-byte seed (RFC 8410 PKCS#8 wrapper). */
const x25519 = async (seed: Uint8Array) => {
  const pkcs8 = new Uint8Array([
    0x30,
    0x2e,
    0x02,
    0x01,
    0x00,
    0x30,
    0x05,
    0x06,
    0x03,
    0x2b,
    0x65,
    0x6e,
    0x04,
    0x22,
    0x04,
    0x20,
    ...seed,
  ])
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'X25519' },
    true,
    ['deriveBits']
  )
  const { x } = (await crypto.subtle.exportKey('jwk', privateKey)) as JsonWebKey
  return { privateKey, publicKey: x as string }
}

const sharedSecret = async (privateKey: CryptoKey, theirPublicKey: string) => {
  const publicKey = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(theirPublicKey),
    { name: 'X25519' },
    false,
    []
  )
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      // WebCrypto's field is `public`; workers-types spells it `$public`.
      {
        name: 'X25519',
        public: publicKey,
      } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      privateKey,
      256
    )
  )
}

/** `b64u(0x01 ‖ nonce[12] ‖ ciphertext ‖ tag[16])`, ChaCha20-Poly1305. */
const seal = (key: Uint8Array, aad: string, plaintext: unknown): string => {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('chacha20-poly1305', key, nonce, {
    authTagLength: 16,
  })
  cipher.setAAD(utf8(aad))
  const body = [
    ...cipher.update(utf8(JSON.stringify(plaintext))),
    ...cipher.final(),
  ]
  return b64u(new Uint8Array([0x01, ...nonce, ...body, ...cipher.getAuthTag()]))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (key: Uint8Array, aad: string, blob: string): any => {
  const bytes = base64ToBytes(blob)
  expect(bytes[0]).toBe(0x01)
  const decipher = createDecipheriv(
    'chacha20-poly1305',
    key,
    bytes.subarray(1, 13),
    {
      authTagLength: 16,
    }
  )
  decipher.setAAD(utf8(aad))
  decipher.setAuthTag(bytes.subarray(bytes.length - 16))
  const plain = new Uint8Array([
    ...decipher.update(bytes.subarray(13, bytes.length - 16)),
    ...decipher.final(),
  ])
  return JSON.parse(new TextDecoder().decode(plain))
}

const inviteSecrets = async (s: Uint8Array) => {
  const claimSecret = await hkdf(s, EMPTY, 'ww-buddies/v1/invite/claim', 32)
  return {
    inviteId: b64u(await hkdf(s, EMPTY, 'ww-buddies/v1/invite/id', 16)),
    inviteKey: await hkdf(s, EMPTY, 'ww-buddies/v1/invite/key', 32),
    claimSecret: b64u(claimSecret),
    claimVerifier: b64u(
      new Uint8Array(await crypto.subtle.digest('SHA-256', claimSecret))
    ),
  }
}

/** The keys for one direction, sender → recipient R. */
const direction = async (pairSecret: Uint8Array, recipientInboxId: string) => ({
  slotId: b64u(
    await hkdf(pairSecret, EMPTY, `ww-buddies/v1/slot|${recipientInboxId}`, 16)
  ),
  writer: await SigningKey.fromSeed(
    await hkdf(
      pairSecret,
      EMPTY,
      `ww-buddies/v1/writer|${recipientInboxId}`,
      32
    )
  ),
  contentKey: await hkdf(
    pairSecret,
    EMPTY,
    `ww-buddies/v1/content|${recipientInboxId}`,
    32
  ),
})

class Person {
  private constructor(
    readonly h: Harness,
    readonly name: string,
    readonly inboxId: string,
    readonly owner: SigningKey,
    readonly dh: { privateKey: CryptoKey; publicKey: string },
    readonly apnsToken: string
  ) {}

  /** Identity from a synced 32-byte root seed, per "Identity (from the root seed)". */
  static async create(h: Harness, name: string): Promise<Person> {
    const root = randomBytes(32)
    const person = new Person(
      h,
      name,
      b64u(await hkdf(root, EMPTY, 'ww-buddies/v1/inbox-id', 16)),
      await SigningKey.fromSeed(
        await hkdf(root, EMPTY, 'ww-buddies/v1/owner-sign', 32)
      ),
      await x25519(await hkdf(root, EMPTY, 'ww-buddies/v1/identity-dh', 32)),
      hexToken(32)
    )
    expect(
      await person.ownerOp('inbox/register', {
        ownerPub: person.owner.publicKey,
      })
    ).toEqual({
      ok: true,
    })
    expect(
      await person.ownerOp('device/register', {
        deviceId: randomId(),
        apnsToken: person.apnsToken,
        apnsEnvironment: 'sandbox',
        templates: {
          'invite.claimed': {
            title: 'Buddy request',
            body: 'Someone accepted your invite',
          },
          'pair.confirmed': { title: 'New buddy', body: 'You are now buddies' },
        },
      })
    ).toEqual({ ok: true })
    return person
  }

  async ownerOp(op: BuddiesSignedOp, payload: Record<string, unknown>) {
    return (
      await this.h.send(op, this.owner, { inboxId: this.inboxId, ...payload })
    ).body
  }

  async write(
    op: BuddiesSignedOp,
    recipientInboxId: string,
    keys: { slotId: string; writer: SigningKey },
    payload: Record<string, unknown>
  ) {
    return this.h.send(op, keys.writer, {
      inboxId: recipientInboxId,
      slotId: keys.slotId,
      ...payload,
    })
  }

  async pairSecret(theirDhPub: string, s: Uint8Array, theirInboxId: string) {
    const [low, high] = [this.inboxId, theirInboxId].sort()
    return hkdf(
      await sharedSecret(this.dh.privateKey, theirDhPub),
      s,
      `ww-buddies/v1/pair|${low}|${high}`,
      32
    )
  }
}

let h: Harness

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.UTC(2026, 8, 27, 9))
  h = await createHarness()
})

afterEach(() => {
  vi.useRealTimers()
})

it('pairs two people end to end: register → invite → claim → confirm → cards → leave', async () => {
  const levi = await Person.create(h, 'Levi')
  const maria = await Person.create(h, 'Maria')
  const pushesTo = (person: Person) =>
    h.pushes.filter((push) => push.url.endsWith(person.apnsToken))

  // 1. Levi creates the invite and shares only the link.
  const s = randomBytes(16)
  const link = `https://ww-proxy.leviwilkerson.com/b#1${b64u(s)}`
  const leviInvite = await inviteSecrets(s)
  const offer = { plans: 'daysTimes' }
  expect(
    await levi.ownerOp('invite/create', {
      inviteId: leviInvite.inviteId,
      claimVerifier: leviInvite.claimVerifier,
      blob: seal(
        leviInvite.inviteKey,
        `ww-buddies/v1/invite-card|${leviInvite.inviteId}`,
        {
          v: 1,
          name: levi.name,
          dhPub: levi.dh.publicKey,
          inboxId: levi.inboxId,
          offer,
        }
      ),
      expiresAt: Date.now() + 7 * DAY_MS,
    })
  ).toEqual({ ok: true })

  // 2. Maria opens the link, fetches, and decrypts the invite card.
  const fragment = new URL(link).hash.slice(1)
  expect(fragment[0]).toBe('1')
  const mariaInvite = await inviteSecrets(base64ToBytes(fragment.slice(1)))
  expect(mariaInvite.inviteId).toBe(leviInvite.inviteId)
  const fetched = (
    await h.post(
      '/invite/fetch',
      unsignedEnvelope({ inviteId: mariaInvite.inviteId })
    )
  ).body
  expect(fetched).toMatchObject({ ok: true, status: 'open' })
  const card = open(
    mariaInvite.inviteKey,
    `ww-buddies/v1/invite-card|${mariaInvite.inviteId}`,
    fetched.blob
  )
  expect(card).toEqual({
    v: 1,
    name: 'Levi',
    dhPub: levi.dh.publicKey,
    inboxId: levi.inboxId,
    offer,
  })

  // 3. Maria accepts: registers Levi → Maria in her inbox, then claims.
  const mariaPair = await maria.pairSecret(card.dhPub, s, card.inboxId)
  const mariaLeviToMaria = await direction(mariaPair, maria.inboxId)
  const mariaMariaToLevi = await direction(mariaPair, levi.inboxId)
  expect(
    await maria.ownerOp('slot/add', {
      slotId: mariaLeviToMaria.slotId,
      writerPub: mariaLeviToMaria.writer.publicKey,
    })
  ).toEqual({ ok: true })
  const claimed = await h.post(
    '/invite/claim',
    unsignedEnvelope({
      inviteId: mariaInvite.inviteId,
      claimSecret: mariaInvite.claimSecret,
      blob: seal(
        mariaInvite.inviteKey,
        `ww-buddies/v1/invite-claim|${mariaInvite.inviteId}`,
        {
          v: 1,
          name: maria.name,
          dhPub: maria.dh.publicKey,
          inboxId: maria.inboxId,
          offer,
        }
      ),
    })
  )
  expect(claimed).toEqual({ status: 200, body: { ok: true } })
  await h.flush()
  expect(pushesTo(levi).map((push) => push.body)).toEqual([
    {
      aps: {
        alert: { title: 'Buddy request', body: 'Someone accepted your invite' },
        sound: 'default',
        'thread-id': 'buddies',
        'content-available': 1,
        'mutable-content': 1,
      },
      ww: {
        kind: 'invite.claimed',
        seq: expect.any(Number),
        eventId: leviInvite.inviteId,
        blob: expect.any(String),
      },
    },
  ])

  // 4. Levi syncs, decrypts the claim, and confirms.
  const leviSync = await levi.ownerOp('inbox/sync', { since: 0 })
  const [claimEvent] = leviSync.events
  expect(claimEvent).toMatchObject({
    eventId: leviInvite.inviteId,
    slotId: '',
    kind: 'invite.claimed',
  })
  // The alert carried that same sealed claim, so the app can name Maria
  // without fetching it.
  const claimPush = pushesTo(levi)[0].body as {
    ww: { seq: number; blob: string }
  }
  expect(claimPush.ww).toMatchObject({
    seq: claimEvent.seq,
    blob: claimEvent.blob,
  })
  const claim = open(
    leviInvite.inviteKey,
    `ww-buddies/v1/invite-claim|${leviInvite.inviteId}`,
    claimEvent.blob
  )
  expect(claim).toMatchObject({ name: 'Maria', inboxId: maria.inboxId })

  const leviPair = await levi.pairSecret(claim.dhPub, s, claim.inboxId)
  expect(leviPair).toEqual(mariaPair)
  const leviToMaria = await direction(leviPair, maria.inboxId)
  const mariaToLevi = await direction(leviPair, levi.inboxId)
  expect(leviToMaria.slotId).toBe(mariaLeviToMaria.slotId)

  expect(
    await levi.ownerOp('slot/add', {
      slotId: mariaToLevi.slotId,
      writerPub: mariaToLevi.writer.publicKey,
    })
  ).toEqual({ ok: true })
  const confirmId = randomId()
  const confirmed = await levi.write('event/put', maria.inboxId, leviToMaria, {
    eventId: confirmId,
    kind: 'pair.confirmed',
    blob: seal(
      leviToMaria.contentKey,
      `ww-buddies/v1/event|${maria.inboxId}|${leviToMaria.slotId}|${confirmId}`,
      { v: 1, name: 'Levi' }
    ),
    push: true,
  })
  expect(confirmed.status).toBe(200)
  const leviPlans = {
    v: 1,
    name: 'Levi',
    updatedAt: Date.now(),
    level: 'daysTimes',
    days: [{ d: '2026-09-27', p: [{ s: 540, m: 180 }] }],
  }
  expect(
    (
      await levi.write('card/put', maria.inboxId, leviToMaria, {
        blob: seal(
          leviToMaria.contentKey,
          `ww-buddies/v1/card|${maria.inboxId}|${leviToMaria.slotId}`,
          leviPlans
        ),
      })
    ).status
  ).toBe(200)
  expect(
    await levi.ownerOp('invite/delete', { inviteId: leviInvite.inviteId })
  ).toEqual({
    ok: true,
  })
  expect(
    (
      await h.post(
        '/invite/fetch',
        unsignedEnvelope({ inviteId: leviInvite.inviteId })
      )
    ).status
  ).toBe(404)

  // 5. Maria gets pair.confirmed, reads Levi's card, and publishes hers.
  await h.flush()
  const mariaSync = await maria.ownerOp('inbox/sync', { since: 0 })
  expect(
    pushesTo(maria).map((push) => (push.body as { ww: unknown }).ww)
  ).toEqual([
    {
      kind: 'pair.confirmed',
      seq: mariaSync.events[0].seq,
      eventId: confirmId,
      blob: mariaSync.events[0].blob,
    },
  ])
  expect(mariaSync.slots).toEqual([
    { slotId: leviToMaria.slotId, createdAt: expect.any(Number) },
  ])
  const [confirmEvent] = mariaSync.events
  expect(
    open(
      mariaLeviToMaria.contentKey,
      `ww-buddies/v1/event|${maria.inboxId}|${confirmEvent.slotId}|${confirmEvent.eventId}`,
      confirmEvent.blob
    )
  ).toEqual({ v: 1, name: 'Levi' })
  expect(
    open(
      mariaLeviToMaria.contentKey,
      `ww-buddies/v1/card|${maria.inboxId}|${mariaSync.cards[0].slotId}`,
      mariaSync.cards[0].blob
    )
  ).toEqual(leviPlans)

  const mariaPlans = {
    v: 1,
    name: 'Maria',
    updatedAt: Date.now(),
    level: 'daysTimes',
    days: [],
  }
  expect(
    (
      await maria.write('card/put', levi.inboxId, mariaMariaToLevi, {
        blob: seal(
          mariaMariaToLevi.contentKey,
          `ww-buddies/v1/card|${levi.inboxId}|${mariaMariaToLevi.slotId}`,
          mariaPlans
        ),
      })
    ).body
  ).toEqual({ ok: true, seq: 2 })
  const leviCards = (await levi.ownerOp('inbox/sync', { since: leviSync.seq }))
    .cards
  expect(
    open(
      mariaToLevi.contentKey,
      `ww-buddies/v1/card|${levi.inboxId}|${leviCards[0].slotId}`,
      leviCards[0].blob
    )
  ).toEqual(mariaPlans)

  // 6. Levi ends it: removes Maria's slot at home and leaves his slot at hers.
  expect(
    await levi.ownerOp('slot/remove', { slotId: mariaToLevi.slotId })
  ).toEqual({ ok: true })
  expect(
    (await levi.write('slot/leave', maria.inboxId, leviToMaria, {})).body
  ).toEqual({
    ok: true,
  })
  const after = await maria.ownerOp('inbox/sync', { since: mariaSync.seq })
  expect(after).toMatchObject({ slots: [], cards: [], events: [] })
  expect(await maria.ownerOp('inbox/sync', { since: 0 })).toMatchObject({
    cards: [],
    events: [],
  })
  expect(
    await maria.write('card/put', levi.inboxId, mariaMariaToLevi, {
      blob: b64u(randomBytes(40)),
    })
  ).toEqual({ status: 410, body: relayError('gone') })
  // Ending sends no push.
  await h.flush()
  expect(h.pushes).toHaveLength(2)
})
