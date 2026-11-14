import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetApnsState } from '../apns'
import { resetFcmState } from '../fcm'
import { resetGoogleAuthState } from '../googleAuth'
import {
  APNS_PAYLOAD_LIMIT,
  FCM_DATA_LIMIT,
  buildBuddiesFcmMessage,
  buildBuddiesPayload,
  deliverPushJob,
  type PushEnv,
} from './push'
import type { PushJob, PushTarget } from './contracts'
import { makeMemoryKv } from '../test/memoryKv'
import { createTestServiceAccount } from '../test/googleServiceAccount'
import {
  APNS_KEY_ID,
  BUNDLE_ID,
  FCM_ACCESS_TOKEN,
  FCM_PROJECT_ID,
  FCM_SEND_URL,
  Owner,
  TEAM_ID,
  createHarness,
  fcmToken,
  hexToken,
  randomId,
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

const NOW = Date.UTC(2026, 8, 23, 12)

type ApnsTarget = Extract<PushTarget, { service: 'apns' }>
type FcmTarget = Extract<PushTarget, { service: 'fcm' }>

const target = (overrides: Partial<ApnsTarget> = {}): ApnsTarget => ({
  service: 'apns',
  deviceId: randomId(),
  token: hexToken(32),
  apnsEnvironment: 'sandbox',
  apnsTopic: null,
  title: 'Buddy request',
  body: 'Someone accepted your invite',
  ...overrides,
})

const androidTarget = (overrides: Partial<FcmTarget> = {}): FcmTarget => ({
  service: 'fcm',
  deviceId: randomId(),
  token: fcmToken(),
  title: 'Buddy request',
  body: 'Someone accepted your invite',
  appAlerts: true,
  ...overrides,
})

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

const EVENT = { eventId: randomId(), blob: 'AQAB' }

/** A push job about event 7, small enough to ride inline. */
const job = (
  targets: PushTarget[],
  overrides: Partial<PushJob> = {}
): PushJob => ({
  inboxId: randomId(),
  kind: 'k',
  seq: 7,
  event: EVENT,
  targets,
  ...overrides,
})

const utf8Length = (text: string) => new TextEncoder().encode(text).length

/** The FCM message a request carried. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fcmMessage = (init: RequestInit): any =>
  JSON.parse(String(init.body)).message

const setup = async () => {
  const keys = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair
  const der = new Uint8Array(
    (await crypto.subtle.exportKey('pkcs8', keys.privateKey)) as ArrayBuffer
  )
  let binary = ''
  for (const byte of der) binary += String.fromCharCode(byte)
  const removeDevices = vi.fn(async () => undefined)
  const serviceAccount = await createTestServiceAccount(FCM_PROJECT_ID)
  const env = {
    FCM_SERVICE_ACCOUNT_JSON: serviceAccount.json,
    APNS_KEY_ID,
    APNS_PRIVATE_KEY: btoa(binary),
    APPLE_TEAM_ID: TEAM_ID,
    IOS_BUNDLE_ID: BUNDLE_ID,
    NOTES_KV: makeMemoryKv(),
    BUDDY_INBOX: {
      idFromName: (name: string) => ({ name }),
      get: () => ({ removeDevices }),
    },
  } as unknown as PushEnv
  const requests: Array<{ url: string; init: RequestInit }> = []
  let respond = (_url: string, _init: RequestInit): Response =>
    new Response(null, { status: 200 })
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init: init ?? {} })
    if (String(input) === GOOGLE_TOKEN_URL)
      return Response.json({ access_token: FCM_ACCESS_TOKEN, expires_in: 3599 })
    return respond(String(input), init ?? {})
  })
  const deps = {
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => NOW,
    sleep: async () => undefined,
  }
  return {
    env,
    removeDevices,
    requests,
    deps,
    respondWith: (fn: (url: string, init: RequestInit) => Response) => {
      respond = fn
    },
  }
}

beforeEach(() => {
  resetApnsState()
  resetFcmState()
  resetGoogleAuthState()
})
afterEach(() => vi.restoreAllMocks())

describe('deliverPushJob', () => {
  it('sends the contract alert to each target environment', async () => {
    const { env, requests, deps } = await setup()
    const sandbox = target()
    const production = target({
      apnsEnvironment: 'production',
      title: 'Hola',
      body: 'Cuerpo',
    })
    await deliverPushJob(
      env,
      job([sandbox, production], { kind: 'invite.claimed' }),
      deps
    )

    expect(requests.map((request) => request.url)).toEqual([
      `https://api.sandbox.push.apple.com/3/device/${sandbox.token}`,
      `https://api.push.apple.com/3/device/${production.token}`,
    ])
    expect(JSON.parse(String(requests[0].init.body))).toEqual({
      aps: {
        alert: { title: 'Buddy request', body: 'Someone accepted your invite' },
        sound: 'default',
        'thread-id': 'buddies',
        'content-available': 1,
        'mutable-content': 1,
      },
      ww: { kind: 'invite.claimed', seq: 7, ...EVENT },
    })
    // Still an alert push at the default priority; content-available only
    // lets iOS wake the app to sync.
    const headers = new Headers(requests[0].init.headers)
    expect(headers.get('apns-push-type')).toBe('alert')
    expect(headers.get('apns-priority')).toBeNull()
    expect(JSON.parse(String(requests[1].init.body)).aps.alert).toEqual({
      title: 'Hola',
      body: 'Cuerpo',
    })
  })

  it('deletes only devices APNs reports as unregistered', async () => {
    const { env, removeDevices, deps, respondWith } = await setup()
    const gone = target()
    const bad = target()
    const wrongTopic = target()
    const fine = target({ apnsEnvironment: 'production' })
    respondWith((url) => {
      if (url.endsWith(gone.token))
        return Response.json({ reason: 'Unregistered' }, { status: 410 })
      if (url.endsWith(bad.token))
        return Response.json({ reason: 'BadDeviceToken' }, { status: 400 })
      if (url.endsWith(wrongTopic.token)) {
        return Response.json(
          { reason: 'DeviceTokenNotForTopic' },
          { status: 400 }
        )
      }
      return new Response(null, { status: 200 })
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const inboxId = randomId()

    await deliverPushJob(
      env,
      job([gone, bad, wrongTopic, fine], { inboxId }),
      deps
    )

    expect(removeDevices).toHaveBeenCalledTimes(1)
    expect(removeDevices).toHaveBeenCalledWith([
      { deviceId: gone.deviceId, token: gone.token },
      { deviceId: bad.deviceId, token: bad.token },
    ])
    // Logged failures never carry the token or ids.
    const logged = JSON.stringify(warn.mock.calls)
    for (const secret of [wrongTopic.token, wrongTopic.deviceId, inboxId]) {
      expect(logged).not.toContain(secret)
    }
  })

  it('removes nothing when APNs is not configured', async () => {
    const { env, removeDevices, requests, deps } = await setup()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await deliverPushJob(
      { ...env, APNS_KEY_ID: undefined },
      job([target()]),
      deps
    )

    expect(requests).toHaveLength(0)
    expect(removeDevices).not.toHaveBeenCalled()
  })
})

describe('deliverPushJob on Android (FCM)', () => {
  it('sends a data-only, high-priority message that the app posts itself', async () => {
    const { env, requests, deps } = await setup()
    const android = androidTarget({ title: 'Hola', body: 'Cuerpo' })

    await deliverPushJob(env, job([android], { kind: 'plan.invite' }), deps)

    const [exchange, send] = requests
    expect(exchange.url).toBe(GOOGLE_TOKEN_URL)
    const claims = JSON.parse(
      atob(
        new URLSearchParams(String(exchange.init.body))
          .get('assertion')!
          .split('.')[1]
          .replace(/-/g, '+')
          .replace(/_/g, '/')
      )
    )
    expect(claims.scope).toBe(
      'https://www.googleapis.com/auth/firebase.messaging'
    )
    expect(send.url).toBe(FCM_SEND_URL)
    expect(new Headers(send.init.headers).get('authorization')).toBe(
      `Bearer ${FCM_ACCESS_TOKEN}`
    )
    expect(fcmMessage(send.init)).toEqual({
      token: android.token,
      // No title or message, so expo-notifications shows nothing itself.
      data: {
        fallbackTitle: 'Hola',
        fallbackBody: 'Cuerpo',
        body: JSON.stringify({ ww: { kind: 'plan.invite', seq: 7, ...EVENT } }),
      },
      android: { priority: 'HIGH', ttl: '86400s' },
    })
    // No notification block: data-only, so the app's task runs every time.
    expect(fcmMessage(send.init).notification).toBeUndefined()
  })

  it('keeps the alert expo-notifications shows for builds before named alerts', async () => {
    const { env, requests, deps } = await setup()
    const android = androidTarget({
      title: 'Hola',
      body: 'Cuerpo',
      appAlerts: false,
    })

    await deliverPushJob(env, job([android], { kind: 'plan.invite' }), deps)

    expect(fcmMessage(requests[1].init).data).toEqual({
      title: 'Hola',
      message: 'Cuerpo',
      body: JSON.stringify({ ww: { kind: 'plan.invite', seq: 7, ...EVENT } }),
      channelId: 'buddies',
    })
  })

  it('routes each device to its own service and reuses the access token', async () => {
    const { env, requests, deps } = await setup()
    const iphone = target({ apnsTopic: 'com.leviwilkerson.jwtimebeta' })
    const pixel = androidTarget()
    const tablet = androidTarget()

    await deliverPushJob(env, job([pixel, iphone, tablet]), deps)
    await deliverPushJob(env, job([pixel]), deps)

    const apns = requests.filter((request) =>
      request.url.startsWith('https://api.sandbox.push.apple.com/')
    )
    expect(apns.map((request) => request.url)).toEqual([
      `https://api.sandbox.push.apple.com/3/device/${iphone.token}`,
    ])
    expect(new Headers(apns[0].init.headers).get('apns-topic')).toBe(
      'com.leviwilkerson.jwtimebeta'
    )
    expect(
      requests
        .filter((request) => request.url === FCM_SEND_URL)
        .map((request) => fcmMessage(request.init).token)
    ).toEqual([pixel.token, tablet.token, pixel.token])
    expect(
      requests.filter((request) => request.url === GOOGLE_TOKEN_URL)
    ).toHaveLength(1)
  })

  it('deletes only devices FCM reports as unregistered, from another project, or not a token', async () => {
    const { env, removeDevices, deps, respondWith } = await setup()
    const gone = androidTarget()
    const otherProject = androidTarget()
    const notAToken = androidTarget()
    const badPayload = androidTarget()
    const fine = androidTarget()
    const fcmError = (status: number, detail: Record<string, unknown>) =>
      Response.json(
        { error: { code: status, status: 'X', details: [detail] } },
        { status }
      )
    respondWith((_url, init) => {
      const token = fcmMessage(init).token
      if (token === gone.token)
        return fcmError(404, {
          '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
          errorCode: 'UNREGISTERED',
        })
      if (token === otherProject.token)
        return fcmError(403, { errorCode: 'SENDER_ID_MISMATCH' })
      if (token === notAToken.token)
        return fcmError(400, {
          '@type': 'type.googleapis.com/google.rpc.BadRequest',
          fieldViolations: [{ field: 'message.token' }],
        })
      if (token === badPayload.token)
        return fcmError(400, { errorCode: 'INVALID_ARGUMENT' })
      return Response.json({ name: 'projects/p/messages/1' })
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const inboxId = randomId()

    await deliverPushJob(
      env,
      job([gone, otherProject, notAToken, badPayload, fine], { inboxId }),
      deps
    )

    expect(removeDevices).toHaveBeenCalledTimes(1)
    expect(removeDevices).toHaveBeenCalledWith(
      [gone, otherProject, notAToken].map(({ deviceId, token }) => ({
        deviceId,
        token,
      }))
    )
    const logged = JSON.stringify(warn.mock.calls)
    for (const secret of [badPayload.token, badPayload.deviceId, inboxId]) {
      expect(logged).not.toContain(secret)
    }
  })

  it('retries a 503 once and mints a new token after a 401', async () => {
    const { env, requests, deps, respondWith, removeDevices } = await setup()
    const busy = androidTarget()
    const fine = androidTarget()
    const sends = new Map<string, number>()
    let rejectAuth = true
    respondWith((_url, init) => {
      const token = fcmMessage(init).token
      sends.set(token, (sends.get(token) ?? 0) + 1)
      if (token === fine.token && rejectAuth) {
        rejectAuth = false
        return Response.json({ error: { status: 'UNAUTHENTICATED' } }, { status: 401 })
      }
      if (token === busy.token && sends.get(token) === 1)
        return Response.json({ error: { status: 'UNAVAILABLE' } }, { status: 503 })
      return Response.json({ name: 'projects/p/messages/1' })
    })

    await deliverPushJob(env, job([busy, fine]), deps)

    expect(sends.get(busy.token)).toBe(2)
    expect(sends.get(fine.token)).toBe(2)
    expect(
      requests.filter((request) => request.url === GOOGLE_TOKEN_URL)
    ).toHaveLength(2)
    expect(removeDevices).not.toHaveBeenCalled()
  })

  it('skips Android devices when FCM is not configured, still sending APNs', async () => {
    const { env, requests, deps, removeDevices } = await setup()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const iphone = target()

    await deliverPushJob(
      { ...env, FCM_SERVICE_ACCOUNT_JSON: undefined },
      job([androidTarget(), iphone]),
      deps
    )

    expect(requests.map((request) => request.url)).toEqual([
      `https://api.sandbox.push.apple.com/3/device/${iphone.token}`,
    ])
    expect(removeDevices).not.toHaveBeenCalled()
  })
})

describe('passive kinds', () => {
  it("delivers buddies' badge news quietly, and everything else with sound", () => {
    const alert = { title: 'Badge', body: 'News' }
    for (const kind of ['badge.new', 'badge.reaction']) {
      const { aps } = buildBuddiesPayload(job([], { kind }), alert)
      expect(aps).toMatchObject({
        'interruption-level': 'passive',
        'content-available': 1,
        'mutable-content': 1,
      })
      expect(aps).not.toHaveProperty('sound')
    }
    const { aps } = buildBuddiesPayload(job([], { kind: 'plan.invite' }), alert)
    expect(aps).toMatchObject({ sound: 'default' })
    expect(aps).not.toHaveProperty('interruption-level')
  })
})

describe('the sealed event in the push', () => {
  /** A blob of `length` base64url characters. */
  const blobOf = (length: number) => 'A'.repeat(length)

  /** The longest blob that still rides inline, found by bisection. */
  const longestInline = (fits: (blob: string) => boolean) => {
    let low = 0
    let high = 10_000
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      if (fits(blobOf(mid))) low = mid
      else high = mid - 1
    }
    return low
  }

  it('rides an APNs alert only while the payload stays within 4 KB', () => {
    const alert = {
      title: 'Nueva invitación',
      body: 'Un compañero te invitó.',
    }
    const payload = (blob: string) =>
      buildBuddiesPayload(
        job([], { event: { eventId: EVENT.eventId, blob } }),
        alert
      )
    const longest = longestInline((blob) => 'blob' in payload(blob).ww)

    const fitting = payload(blobOf(longest))
    expect(fitting.ww).toEqual({
      kind: 'k',
      seq: 7,
      eventId: EVENT.eventId,
      blob: blobOf(longest),
    })
    expect(utf8Length(JSON.stringify(fitting))).toBe(APNS_PAYLOAD_LIMIT)
    // One byte more and only the kind and seq go, with the same alert.
    const over = payload(blobOf(longest + 1))
    expect(over.ww).toEqual({ kind: 'k', seq: 7 })
    expect(over.aps).toEqual(fitting.aps)
  })

  it('counts multibyte alert text against the limit', () => {
    const blob = blobOf(3700)
    const short = buildBuddiesPayload(job([], { event: { ...EVENT, blob } }), {
      title: 'a',
      body: 'b',
    })
    const long = buildBuddiesPayload(job([], { event: { ...EVENT, blob } }), {
      title: '招待'.repeat(40),
      body: '招待'.repeat(40),
    })
    expect(short.ww).toHaveProperty('blob')
    expect(long.ww).not.toHaveProperty('blob')
  })

  it('rides an FCM message only while its data stays within the limit', () => {
    const alert = { title: 'Hola', body: 'Cuerpo', appAlerts: true }
    const message = (blob: string) =>
      buildBuddiesFcmMessage(
        job([], { event: { eventId: EVENT.eventId, blob } }),
        alert
      )
    const marker = (blob: string) =>
      JSON.parse(message(blob).data.body).ww as Record<string, unknown>
    const longest = longestInline((blob) => 'blob' in marker(blob))

    const size = (data: Record<string, string>) =>
      Object.entries(data).reduce(
        (total, [key, value]) => total + utf8Length(key) + utf8Length(value),
        0
      )
    expect(size(message(blobOf(longest)).data)).toBe(FCM_DATA_LIMIT)
    expect(marker(blobOf(longest + 1))).toEqual({ kind: 'k', seq: 7 })
    expect(message(blobOf(longest + 1)).data).toMatchObject({
      fallbackTitle: 'Hola',
      fallbackBody: 'Cuerpo',
    })
  })
})

describe('stale device cleanup through the relay', () => {
  it('removes a device from the inbox after APNs answers 410', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    try {
      const h = await createHarness()
      const owner = await Owner.create(h)
      const staleToken = hexToken(32)
      await owner.registerDevice(randomId(), undefined, staleToken)
      await owner.registerDevice()
      h.apnsResponse = (push) =>
        push.url.endsWith(staleToken)
          ? Response.json({ reason: 'Unregistered' }, { status: 410 })
          : new Response(null, { status: 200 })

      const buddy = await owner.addWriter()
      await buddy.putEvent({ push: true })
      await h.flush()

      expect(h.pushes).toHaveLength(2)
      const tokens = h.inboxes
        .storage(owner.inboxId)
        .query('SELECT token FROM push_device')
        .map((row) => row.token)
      expect(tokens).toHaveLength(1)
      expect(tokens).not.toContain(staleToken)
    } finally {
      vi.useRealTimers()
    }
  })
})
