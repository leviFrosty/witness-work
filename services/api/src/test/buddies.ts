import { vi } from 'vitest'
import { BuddyInbox } from '../buddies/inboxDO'
import { BuddyInvite } from '../buddies/inviteDO'
import { BuddyRegistrationQuota } from '../buddies/registrationQuota'
import { AccountHandoff } from '../accounts/handoffDO'
import { AccountSync } from '../accounts/syncDO'
import { SharedSpace } from '../spaces/spaceDO'
import { SPACES_LIMITS } from '../spaces/contracts'
import { AccountRateCounter } from '../accounts/rateCounterDO'
import { AccountApproval } from '../accounts/approvalDO'
import { BUDDIES_ABUSE_LIMITS } from '../buddies/limits'
import { createBuddiesRoutes } from '../buddies/route'
import { resetApnsState } from '../apns'
import { resetFcmState } from '../fcm'
import { resetGoogleAuthState } from '../googleAuth'
import type { BuddiesSignedOp } from '../buddies/contracts'
import type { Environment } from '../types'
import { makeMemoryKv, type MemoryKv } from './memoryKv'
import { makeMemoryR2, type MemoryR2 } from './memoryR2'
import { makeMemoryD1, type MemoryD1 } from './memoryD1'
import { createTestServiceAccount } from './googleServiceAccount'
import {
  WORKERS_WEBSOCKET_GLOBALS,
  createNamespace,
  type FakeNamespace,
  type FakeWebSocket,
} from './durableObjects'
import {
  SigningKey,
  b64u,
  blobOfSize,
  blobPutHeaders,
  envelope,
  hexToken,
  liveHeaders,
  randomBytes,
  randomId,
  unsignedEnvelope,
  type PhotoBlob,
} from './buddiesClient'

export * from './buddiesClient'

/**
 * End-to-end harness for the Buddies relay: the real Hono routes, the real
 * Durable Object classes on SQLite, an in-memory KV and R2 bucket (photos on
 * through `BUDDIES_PHOTOS`, as locally and on Beta), rate limiters that count
 * like the local runtime's (fixed windows on the faked clock, production
 * limits unless overridden), a recording APNs and FCM `fetch` (Google's
 * OAuth token exchange answered with a fixed token), and fake Workers
 * WebSockets (stubbed globals). Requires `vi.mock('cloudflare:workers')` in
 * the calling test file.
 */

export const TEAM_ID = 'TEAMID1234'
export const APNS_KEY_ID = 'KEYID56789'
export const BUNDLE_ID = 'com.leviwilkerson.jwtimedev'
/** Also accepted as an APNs topic (`IOS_ADDITIONAL_BUNDLE_IDS`). */
export const BETA_BUNDLE_ID = 'com.leviwilkerson.jwtimebeta'
export const FCM_PROJECT_ID = 'ww-test-project'
export const FCM_ACCESS_TOKEN = 'ya29.fcm-test'
export const FCM_SEND_URL = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

let fcmAccount: Promise<string> | null = null
/** One RSA key for every harness: generating one per test is slow. */
const fcmServiceAccount = (): Promise<string> =>
  (fcmAccount ??= createTestServiceAccount(FCM_PROJECT_ID).then(
    (account) => account.json
  ))

/** A fake FCM registration token: long base64url with a `:`, like real ones. */
export const fcmToken = (): string =>
  `${randomId()}:APA91b${b64u(randomBytes(96))}`

export interface RecordedPush {
  url: string
  headers: Record<string, string>
  body: unknown
}

export interface ApiResponse {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

/** A `blob/get` answer: the bytes on 200, else the JSON error. */
export interface BlobResponse {
  status: number
  headers: Headers
  bytes: Uint8Array | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

/** An `inbox/live` answer: the client end on 101, else the JSON error. */
export interface LiveResponse {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
  socket: FakeWebSocket | null
  /** The `Sec-WebSocket-Protocol` the answer chose, if any. */
  protocol: string | null
}

export interface HarnessOptions {
  enabled?: string
  kvEnabled?: string
  apnsConfigured?: boolean
  fcmConfigured?: boolean
  /** Per-minute limit for unsigned ops; production's by default. */
  unsignedLimit?: number
  /** The `BUDDIES_PHOTOS` var; `"on"` (dev's and Beta's) by default. */
  photos?: string
  /** KV `buddies:photos`, when set. */
  kvPhotos?: string
  /** Bind the R2 bucket (default true). */
  blobBucket?: boolean
  /** Bind the accounts database (default true). */
  accountsDb?: boolean
  /** Bind the account backup bucket (default true). */
  backupBucket?: boolean
  /** Bind the Cloud Sync bucket (`ACCOUNT_SYNC`). Default true. */
  syncBucket?: boolean
  /** The `SPACES_ENABLED` var; `"true"` (dev's and Beta's) by default. */
  spacesEnabled?: string
  /** The `SPACES_GUESTS` var; `"true"` (dev's and Beta's) by default. */
  spacesGuests?: string
  /** Per-minute limit of `SPACES_GUEST_LIMITER`; production's by default. */
  guestLimit?: number
  /** Bind the Cloud Sync photo bucket (`ACCOUNT_PHOTOS`). Default true. */
  photoBucket?: boolean
  /**
   * Account sessions as on a local development worker (default true): a token secret,
   * `APP_ATTEST_ENVIRONMENT` development, and the dev bypass token.
   */
  sessions?: boolean
}

/** The harness's `ACCOUNT_TOKEN_SECRET` and dev bypass token. */
export const TEST_TOKEN_SECRET = 'test-account-token-secret-0123456789abcdef'
/** The harness's `LIVE_TICKET_SECRET`. */
export const TEST_LIVE_TICKET_SECRET = 'test-live-ticket-secret-0123456789abcdef'
export const TEST_DEV_BYPASS = 'test-dev-bypass-token'
/** A web app origin in the harness's `WEB_APP_ORIGINS` (the dev list's). */
export const TEST_WEB_ORIGIN = 'http://localhost:8081'
/** The harness's passkey challenge and ticket secrets. */
export const TEST_CHALLENGE_SECRET = 'test-passkey-challenge-secret-0123456789ab'
export const TEST_TICKET_SECRET = 'test-account-ticket-secret-0123456789abcdef'

/**
 * The local development worker's relying parties (wrangler.toml
 * `[env.dev.vars]`): Beta's RP ID, which native development builds borrow,
 * and `localhost`.
 */
export const TEST_RP_ID = 'beta.app.witnesswork.app'
export const TEST_ORIGIN = 'https://beta.app.witnesswork.app'
export const TEST_ANDROID_ORIGIN =
  'android:apk-key-hash:-sYXRdwJA3hvue3mKpYrOZ9zSPC7b4mbgzJmdZEDO5w'
export const TEST_LOCAL_ORIGIN = 'http://localhost:8081'
export const TEST_PASSKEY_VARS = {
  PASSKEY_RP_IDS: `${TEST_RP_ID},localhost`,
  PASSKEY_ORIGINS: JSON.stringify({
    [TEST_RP_ID]: [
      TEST_ORIGIN,
      'android:apk-key-hash:TBOYNDcshVpuphnPrwPUa5EUFC3ry8vL8cHHQFU-HKw',
      'android:apk-key-hash:xR7_3Ju_a8Are0wxkpALrEJnvW4F9M_FIXflNiOkdes',
      TEST_ANDROID_ORIGIN,
    ],
    localhost: [
      'http://localhost:8081',
      'http://localhost:8082',
      'http://localhost:19006',
      'http://localhost:4173',
      'http://localhost:5173',
    ],
  }),
}

export interface Harness {
  env: Environment
  kv: MemoryKv
  /** The `BUDDY_BLOBS` bucket (present even when unbound, for assertions). */
  r2: MemoryR2
  /** The `ACCOUNTS_DB` database, when bound. */
  accountsDb: MemoryD1 | null
  /** The `ACCOUNT_BACKUPS` bucket (present even when unbound, for assertions). */
  backups: MemoryR2
  /** The `ACCOUNT_SYNC` bucket (present even when unbound, for assertions). */
  syncBlobs: MemoryR2
  /** The `ACCOUNT_PHOTOS` bucket (present even when unbound, for assertions). */
  photoBlobs: MemoryR2
  handoffs: FakeNamespace<AccountHandoff>
  syncIndexes: FakeNamespace<AccountSync>
  /** Shared Spaces' `SHARED_SPACE` objects, one per space id. */
  spaces: FakeNamespace<SharedSpace>
  rateCounters: FakeNamespace<AccountRateCounter>
  approvals: FakeNamespace<AccountApproval>
  inboxes: FakeNamespace<BuddyInbox>
  invites: FakeNamespace<BuddyInvite>
  quotas: FakeNamespace<BuddyRegistrationQuota>
  /** APNs and FCM sends (Google's token exchange isn't recorded). */
  pushes: RecordedPush[]
  apnsPublicKey: CryptoKey
  /** Decides each APNs response; default 200. */
  apnsResponse: (push: RecordedPush) => Response
  /** Decides each FCM response; default 200. */
  fcmResponse: (push: RecordedPush) => Response
  /** Keys the unsigned-op limiter saw, refused ones included. */
  rateLimitKeys: string[]
  /** Keys the Shared Spaces guest limiter saw, refused ones included. */
  guestLimitKeys: string[]
  /** The raw Response for a request to the relay routes. */
  request(path: string, init: RequestInit): Promise<Response>
  post(
    path: string,
    body: unknown,
    headers?: Record<string, string>
  ): Promise<ApiResponse>
  send(
    op: BuddiesSignedOp,
    key: SigningKey,
    payload: Record<string, unknown>
  ): Promise<ApiResponse>
  /** `inbox/live` with these request headers; GET unless `method` says. */
  live(headers: Record<string, string>, method?: string): Promise<LiveResponse>
  /** `blob/get` for `{ inboxId, blobId, token }` (or a raw body). */
  getBlob(payload: Record<string, unknown> | string): Promise<BlobResponse>
  /** Awaits every `waitUntil` task (push delivery). */
  flush(): Promise<void>
}

/**
 * A per-key limiter that counts like the local runtime's (Miniflare): fixed
 * one-minute windows on the (faked) clock, refused calls not counted.
 */
const fakeRateLimiter = (limit: number, seen?: string[]) => {
  let window = -1
  const counts = new Map<string, number>()
  return {
    limit: async ({ key }: { key: string }) => {
      seen?.push(key)
      const current = Math.floor(Date.now() / 60_000)
      if (current !== window) {
        window = current
        counts.clear()
      }
      const used = counts.get(key) ?? 0
      if (used >= limit) return { success: false }
      counts.set(key, used + 1)
      return { success: true }
    },
  }
}

const pem = (der: Uint8Array): string => {
  let binary = ''
  for (const byte of der) binary += String.fromCharCode(byte)
  const lines = btoa(binary).match(/.{1,64}/g) ?? []
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`
}

export const createHarness = async (
  options: HarnessOptions = {}
): Promise<Harness> => {
  resetApnsState()
  resetFcmState()
  resetGoogleAuthState()
  for (const [name, value] of Object.entries(WORKERS_WEBSOCKET_GLOBALS))
    vi.stubGlobal(name, value)
  const kv = makeMemoryKv()
  if (options.kvEnabled != null)
    await kv.put('buddies:enabled', options.kvEnabled)
  if (options.kvPhotos != null) await kv.put('buddies:photos', options.kvPhotos)
  const r2 = makeMemoryR2()
  const backups = makeMemoryR2()
  const syncBlobs = makeMemoryR2()
  const photoBlobs = makeMemoryR2()
  const accountsDb = options.accountsDb === false ? null : makeMemoryD1()

  const apnsKeys = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair
  const apnsPrivateKey = pem(
    new Uint8Array(
      (await crypto.subtle.exportKey(
        'pkcs8',
        apnsKeys.privateKey
      )) as ArrayBuffer
    )
  )

  const rateLimitKeys: string[] = []
  const guestLimitKeys: string[] = []
  const limiters = Object.fromEntries(
    Object.entries(BUDDIES_ABUSE_LIMITS.edge).map(
      ([tier, { binding, perMinute }]) => [
        binding,
        tier === 'unsigned'
          ? fakeRateLimiter(options.unsignedLimit ?? perMinute, rateLimitKeys)
          : fakeRateLimiter(perMinute),
      ]
    )
  )
  const env = {
    NOTES_KV: kv,
    APPLE_TEAM_ID: TEAM_ID,
    IOS_BUNDLE_ID: BUNDLE_ID,
    IOS_ADDITIONAL_BUNDLE_IDS: BETA_BUNDLE_ID,
    BUDDIES_ENABLED: options.enabled ?? 'true',
    BUDDIES_PHOTOS: options.photos ?? 'on',
    ...(options.blobBucket === false ? {} : { BUDDY_BLOBS: r2 }),
    ...(accountsDb ? { ACCOUNTS_DB: accountsDb } : {}),
    ...(options.backupBucket === false ? {} : { ACCOUNT_BACKUPS: backups }),
    ...(options.syncBucket === false ? {} : { ACCOUNT_SYNC: syncBlobs }),
    ...(options.photoBucket === false ? {} : { ACCOUNT_PHOTOS: photoBlobs }),
    SYNC_ENABLED: 'true',
    SPACES_ENABLED: options.spacesEnabled ?? 'true',
    SPACES_GUESTS: options.spacesGuests ?? 'true',
    SPACES_GUEST_LIMITER: fakeRateLimiter(
      options.guestLimit ?? SPACES_LIMITS.guestRequestsPerMinute,
      guestLimitKeys
    ),
    WEB_APP_ORIGINS: `https://beta.app.witnesswork.app,${TEST_WEB_ORIGIN}`,
    ...(options.sessions === false
      ? {}
      : {
          ACCOUNT_TOKEN_SECRET: TEST_TOKEN_SECRET,
          LIVE_TICKET_SECRET: TEST_LIVE_TICKET_SECRET,
          APP_ATTEST_ENVIRONMENT: 'development',
          NOTES_IMPORT_DEV_BYPASS_TOKEN: TEST_DEV_BYPASS,
          PASSKEY_CHALLENGE_SECRET: TEST_CHALLENGE_SECRET,
          ACCOUNT_TICKET_SECRET: TEST_TICKET_SECRET,
          ...TEST_PASSKEY_VARS,
        }),
    ...limiters,
    ...(options.apnsConfigured === false
      ? {}
      : { APNS_KEY_ID, APNS_PRIVATE_KEY: apnsPrivateKey }),
    ...(options.fcmConfigured === false
      ? {}
      : {
          FCM_SERVICE_ACCOUNT_JSON: await fcmServiceAccount(),
        }),
  } as unknown as Environment & Record<string, unknown>

  const inboxes = createNamespace(
    (state) => new BuddyInbox(state as never, env as never)
  )
  const invites = createNamespace(
    (state) => new BuddyInvite(state as never, env as never)
  )
  const quotas = createNamespace(
    (state) => new BuddyRegistrationQuota(state as never, env as never)
  )
  env.BUDDY_INBOX = inboxes.namespace as Environment['BUDDY_INBOX']
  env.BUDDY_INVITE = invites.namespace as Environment['BUDDY_INVITE']
  env.BUDDY_REGISTRATION_QUOTA =
    quotas.namespace as Environment['BUDDY_REGISTRATION_QUOTA']
  const handoffs = createNamespace(
    (state) => new AccountHandoff(state as never, env as never)
  )
  env.ACCOUNT_HANDOFF = handoffs.namespace as Environment['ACCOUNT_HANDOFF']
  const syncIndexes = createNamespace(
    (state) => new AccountSync(state as never, env as never)
  )
  env.ACCOUNT_SYNC_INDEX =
    syncIndexes.namespace as Environment['ACCOUNT_SYNC_INDEX']
  const spaces = createNamespace(
    (state) => new SharedSpace(state as never, env as never)
  )
  env.SHARED_SPACE = spaces.namespace as Environment['SHARED_SPACE']
  const rateCounters = createNamespace(
    (state) => new AccountRateCounter(state as never, env as never)
  )
  env.ACCOUNT_RATE_COUNTER =
    rateCounters.namespace as Environment['ACCOUNT_RATE_COUNTER']
  const approvals = createNamespace(
    (state) => new AccountApproval(state as never, env as never)
  )
  env.ACCOUNT_APPROVAL = approvals.namespace as Environment['ACCOUNT_APPROVAL']

  const pending: Promise<unknown>[] = []
  const executionCtx = {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise)
    },
    passThroughOnException: () => undefined,
    props: {},
  } as unknown as ExecutionContext

  const harness: Harness = {
    env,
    kv,
    r2,
    accountsDb,
    backups,
    syncBlobs,
    photoBlobs,
    handoffs,
    syncIndexes,
    spaces,
    rateCounters,
    approvals,
    inboxes,
    invites,
    quotas,
    pushes: [],
    apnsPublicKey: apnsKeys.publicKey,
    apnsResponse: () => new Response(null, { status: 200 }),
    fcmResponse: () => Response.json({ name: 'projects/p/messages/1' }),
    rateLimitKeys,
    guestLimitKeys,
    request: async () => {
      throw new Error('replaced below')
    },
    post: async () => {
      throw new Error('replaced below')
    },
    send: async () => {
      throw new Error('replaced below')
    },
    live: async () => {
      throw new Error('replaced below')
    },
    getBlob: async () => {
      throw new Error('replaced below')
    },
    flush: async () => {
      while (pending.length) await Promise.all(pending.splice(0))
    },
  }

  const pushFetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === GOOGLE_TOKEN_URL)
        return Response.json({
          access_token: FCM_ACCESS_TOKEN,
          expires_in: 3599,
        })
      const push: RecordedPush = {
        url: String(input),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: JSON.parse(String(init?.body)),
      }
      harness.pushes.push(push)
      return push.url === FCM_SEND_URL
        ? harness.fcmResponse(push)
        : harness.apnsResponse(push)
    }
  )
  const routes = createBuddiesRoutes({
    push: {
      fetch: pushFetch as unknown as typeof fetch,
      now: () => Date.now(),
      sleep: async () => undefined,
    },
  })

  harness.request = async (path, init) =>
    routes.request(path, init, env, executionCtx)

  harness.post = async (path, body, headers = {}) => {
    const response = await harness.request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.7',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }

  harness.live = async (headers, method = 'GET') => {
    const response = (await routes.request(
      '/inbox/live',
      { method, headers: { 'cf-connecting-ip': '203.0.113.7', ...headers } },
      env,
      executionCtx
    )) as Response & { webSocket?: FakeWebSocket | null }
    const protocol = response.headers.get('sec-websocket-protocol')
    if (response.status === 101)
      return {
        status: 101,
        body: null,
        socket: response.webSocket ?? null,
        protocol,
      }
    const text = await response.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // Not JSON (e.g. Hono's plain 404).
    }
    return { status: response.status, body, socket: null, protocol }
  }

  harness.getBlob = async (payload) => {
    const response = await harness.request('/blob/get', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.7',
      },
      body:
        typeof payload === 'string'
          ? payload
          : JSON.stringify(unsignedEnvelope(payload)),
    })
    if (response.status === 200) {
      return {
        status: 200,
        headers: response.headers,
        bytes: new Uint8Array(await response.arrayBuffer()),
        body: null,
      }
    }
    return {
      status: response.status,
      headers: response.headers,
      bytes: null,
      body: await response.json(),
    }
  }

  harness.send = async (op, key, payload) =>
    harness.post(
      `/${op}`,
      await envelope(op, { ts: Date.now(), nonce: randomId(), ...payload }, key)
    )

  return harness
}

/** One person's Buddies identity: an inbox and the owner key that signs for it. */
export class Owner {
  readonly inboxId = randomId()

  private constructor(
    readonly harness: Harness,
    readonly key: SigningKey
  ) {}

  static async create(harness: Harness, register = true): Promise<Owner> {
    const owner = new Owner(harness, await SigningKey.generate())
    if (register) {
      const response = await owner.send('inbox/register', {
        ownerPub: owner.key.publicKey,
      })
      if (response.status !== 200)
        throw new Error(`register failed: ${response.status}`)
    }
    return owner
  }

  send(
    op: BuddiesSignedOp,
    payload: Record<string, unknown> = {}
  ): Promise<ApiResponse> {
    return this.harness.send(op, this.key, {
      inboxId: this.inboxId,
      ...payload,
    })
  }

  sync(since = 0): Promise<ApiResponse> {
    return this.send('inbox/sync', { since })
  }

  /** Opens a live socket; `fields` override the signed payload's. */
  async connect(fields: Record<string, unknown> = {}): Promise<LiveResponse> {
    return this.harness.live(
      await liveHeaders(
        { inboxId: this.inboxId, ts: Date.now(), nonce: randomId(), ...fields },
        this.key
      )
    )
  }

  registerDevice(
    deviceId = randomId(),
    templates: Record<string, { title: string; body: string }> = {
      'invite.claimed': {
        title: 'Buddy request',
        body: 'Someone accepted your invite',
      },
      'pair.confirmed': {
        title: 'You are buddies',
        body: 'Your buddy confirmed',
      },
      'plan.joined': { title: 'Plans', body: 'A buddy is coming' },
    },
    apnsToken = hexToken(32),
    apnsEnvironment: 'sandbox' | 'production' = 'sandbox',
    extra: Record<string, unknown> = {}
  ): Promise<ApiResponse> {
    return this.send('device/register', {
      deviceId,
      apnsToken,
      apnsEnvironment,
      templates,
      ...extra,
    })
  }

  /** An Android device: FCM instead of APNs. */
  registerFcmDevice(
    deviceId = randomId(),
    templates: Record<string, { title: string; body: string }> = {
      'invite.claimed': {
        title: 'Buddy request',
        body: 'Someone accepted your invite',
      },
      'pair.confirmed': {
        title: 'You are buddies',
        body: 'Your buddy confirmed',
      },
    },
    token = fcmToken(),
    appAlerts?: boolean
  ): Promise<ApiResponse> {
    return this.send('device/register', {
      deviceId,
      pushService: 'fcm',
      fcmToken: token,
      templates,
      ...(appAlerts === undefined ? {} : { appAlerts }),
    })
  }

  /**
   * `blob/put` of `blob`, signed by this owner; `fields` override the signed
   * payload, `init` the request (body, headers; an empty value drops one).
   * Sends `Content-Length` unless `init.headers` says otherwise.
   */
  async putBlob(
    blob: PhotoBlob,
    fields: Record<string, unknown> = {},
    init: { body?: BodyInit; headers?: Record<string, string> } = {}
  ): Promise<ApiResponse & { headers: Headers }> {
    const payload = {
      inboxId: this.inboxId,
      blobId: blob.blobId,
      bytes: blob.bytes.byteLength,
      expiresAt: Date.now() + 30 * DAY_MS,
      readTokenHash: blob.readTokenHash,
      ts: Date.now(),
      nonce: randomId(),
      ...fields,
    }
    const headers = Object.entries({
      'cf-connecting-ip': '203.0.113.7',
      'content-length': String(blob.bytes.byteLength),
      ...(await blobPutHeaders(payload, this.key)),
      ...init.headers,
    }).filter(([, value]) => value !== '')
    const response = await this.harness.request('/blob/put', {
      method: 'POST',
      headers: Object.fromEntries(headers),
      body: init.body ?? blob.bytes,
      // Streamed bodies (the cutoff tests) need half-duplex in Node.
      ...({ duplex: 'half' } as object),
    })
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json(),
    }
  }

  /** `blob/get` of one of this owner's blobs with `token` (its own by default). */
  getBlob(blob: PhotoBlob, token = blob.token): Promise<BlobResponse> {
    return this.harness.getBlob({
      inboxId: this.inboxId,
      blobId: blob.blobId,
      token,
    })
  }

  /** Adds a slot and returns the writer key a buddy would sign with. */
  async addWriter(slotId = randomId()): Promise<Writer> {
    const key = await SigningKey.generate()
    const response = await this.send('slot/add', {
      slotId,
      writerPub: key.publicKey,
    })
    if (response.status !== 200)
      throw new Error(`slot/add failed: ${response.status}`)
    return new Writer(this.harness, this.inboxId, slotId, key)
  }
}

/** A buddy's write capability into one recipient inbox slot. */
export class Writer {
  constructor(
    readonly harness: Harness,
    readonly inboxId: string,
    readonly slotId: string,
    readonly key: SigningKey
  ) {}

  send(
    op: BuddiesSignedOp,
    payload: Record<string, unknown> = {}
  ): Promise<ApiResponse> {
    return this.harness.send(op, this.key, {
      inboxId: this.inboxId,
      slotId: this.slotId,
      ...payload,
    })
  }

  putCard(blob = blobOfSize(64)): Promise<ApiResponse> {
    return this.send('card/put', { blob })
  }

  putEvent(
    fields: Partial<{
      eventId: string
      kind: string
      blob: string
      push: boolean
    }> = {}
  ) {
    return this.send('event/put', {
      eventId: randomId(),
      kind: 'plan.joined',
      blob: blobOfSize(48),
      push: false,
      ...fields,
    })
  }
}

/** Invite secrets as the contract derives them; ids here are just random. */
export const inviteSecrets = async () => {
  const claimSecret = randomBytes(32)
  const verifier = new Uint8Array(
    await crypto.subtle.digest('SHA-256', claimSecret)
  )
  return {
    inviteId: randomId(),
    claimSecret: b64u(claimSecret),
    claimVerifier: b64u(verifier),
  }
}

export const DAY_MS = 24 * 60 * 60 * 1000
