import { sha256 } from '@noble/hashes/sha2.js'
import { toB64u } from '@/lib/bytes'

/**
 * An in-memory ww-api for Cloud Sync's ops (docs/accounts-protocol.md, "Sync"),
 * for tests: one namespace of slots per bearer token's account, and its photos
 * (docs/cloud-sync-photos.md). Answers the way the worker does, including the
 * switches and the storage limit.
 */
export type FakeSyncServer = ReturnType<typeof createFakeSyncServer>

type SlotPlatform = 'ios' | 'android' | 'dev' | 'web'

type Slot = {
  bytes: Uint8Array
  etag: string
  updatedAt: number
  /** The platform of the session that last wrote it. */
  platform: SlotPlatform
}

type Photo = {
  bytes: Uint8Array
  sha256: string
  createdAt: number
  meta: string
}

const PHOTO_NAME = /^[A-Za-z0-9_-]{43}$/
const MAX_PHOTO_BLOB = 25 * 1024 * 1024

/**
 * The server's reservation for a photo put of this many bytes: a minute of
 * setup plus the body at 50 KiB/s, from 2 to 10 minutes.
 */
const photoReservationMs = (bytes: number) =>
  Math.min(
    10 * 60_000,
    Math.max(2 * 60_000, 60_000 + (bytes / (50 * 1024)) * 1000)
  )

/** Resolves after `ms`, or rejects the way `fetch` does when `signal` aborts. */
const arrive = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort)
  })

export function createFakeSyncServer() {
  const accounts = new Map<string, Map<string, Slot>>()
  const photoAccounts = new Map<string, Map<string, Photo>>()
  /** Each account's standing Cloud Sync request (epoch ms). */
  const requests = new Map<string, number>()
  /** Signed request payloads already used. */
  const usedEnvelopes = new Set<unknown>()
  /** Accounts whose writing sessions have all ended. */
  const ended = new Set<string>()
  /** `<account>/<slotId>` whose last writer's session ended. */
  const endedSlots = new Set<string>()
  let seq = 0
  let clock = 0
  const lastPutAt = new Map<string, number>()
  const state = {
    enabled: true,
    entitlement: 'supporter' as 'supporter' | 'everyone',
    supporters: new Set<string>(),
    /** How long a put takes to upload (a slow connection). */
    putDelayMs: 0,
    /**
     * How fast a photo put's body arrives (a slow link), in bytes a second; 0
     * is instant. The put is 409 `conflict` when its upload outlives the
     * server's reservation (docs/cloud-sync-photos.md, "Races"), and the body
     * stops arriving when the client gives up.
     */
    photoUploadBytesPerSecond: 0,
    /**
     * How fast a photo get's body arrives (a slow link), in bytes a second; 0
     * is instant. The body stops arriving when the client gives up.
     */
    photoDownloadBytesPerSecond: 0,
    /**
     * While set, a photo get doesn't answer until it resolves (a download stuck
     * on a slow link, without the wait); it stops when the client gives up.
     */
    photoGetGate: null as Promise<void> | null,
    /**
     * A slot's puts at most this often (ww-api: one every 2 s); a sooner one is
     * 429 `rate_limited`. 0: no limit.
     */
    slotPutIntervalMs: 0,
    /** Photos' own switch (`sync:photos`). */
    photos: true,
    /** The account's photo storage (`SYNC_PHOTO_LIMIT_BYTES`). */
    photoLimitBytes: 2_000_000_000,
    /** Live photos an account. */
    photoCountLimit: 20_000,
    /** Photos a list page. */
    photoPageSize: 1000,
    /** Photo puts and deletes, with the slot each said it came from. */
    photoWrites: [] as Array<{ op: string; slotId: string | null }>,
    /** Fails the next photo op (`op`'s, when set) with this code, once. */
    photoFailure: null as {
      code: string
      status: number
      op?: string
    } | null,
    /** The account's key changed more than 7 days ago: re-seals are refused. */
    resealForbidden: false,
    /**
     * The next this many puts are refused as too soon after the last, or (with
     * a longer `putRetryAfterSec`) while another put of the slot is in flight.
     */
    rateLimitedPuts: 0,
    putRetryAfterSec: 2,
    /** Runs before a put lands (another device writing in between). */
    beforePut: null as ((slotId: string) => void) | null,
    /** Every request, as `<method> <op>` (no ids), for assertions. */
    log: [] as string[],
    /** The server's time for a new Cloud Sync request; `Date.now()` when null. */
    now: null as number | null,
    /** The platform of the session a put comes from. */
    platform: 'ios' as SlotPlatform,
    /** `sync/list` leaves out `live`, as a server from before it does. */
    listOmitsLive: false,
    /** Every `sync/put` fails with a 500. */
    failPuts: false,
    /**
     * The next `sync/request` is taken, then its answer lost (a dropped
     * connection).
     */
    dropNextAnswer: false,
    /** While set, listing and reading slots fail like a dropped connection. */
    failReads: false,
    /** While set, deleting photos fails like a dropped connection. */
    failPhotoDeletes: false,
    /** `sync/request` bodies, with the bearer token they came with. */
    requestBodies: [] as Array<Record<string, unknown>>,
    /** Every slot id `sync/delete` was asked for, in order. */
    deletedSlots: [] as string[],
  }

  const slotsOf = (account: string) => {
    let slots = accounts.get(account)
    if (!slots) accounts.set(account, (slots = new Map()))
    return slots
  }
  const photosOf = (account: string) => {
    let photos = photoAccounts.get(account)
    if (!photos) photoAccounts.set(account, (photos = new Map()))
    return photos
  }
  const usageOf = (account: string) => {
    const photos = [...photosOf(account).values()]
    return {
      bytes: photos.reduce((sum, photo) => sum + photo.bytes.length, 0),
      count: photos.length,
      limit: state.photoLimitBytes,
    }
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  const refuse = (code: string, status: number) =>
    json({ ok: false, error: code, code }, status)

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const op = url.pathname.replace(/^\/accounts\/v1\//, '')
    const method = init?.method ?? 'GET'
    state.log.push(`${method} ${op}`)
    const headers = new Headers(init?.headers)
    const account = headers.get('authorization')?.replace(/^Bearer /, '')
    if (!account) return refuse('unauthorized', 401)
    const entitled =
      state.enabled &&
      (state.entitlement === 'everyone' || state.supporters.has(account))
    if (op === 'sync' && method === 'GET')
      return json({
        ok: true,
        enabled: state.enabled,
        entitled,
        entitlement: state.entitlement,
        supporter: state.supporters.has(account),
        photos: state.photos,
        requestedAt: requests.get(account) ?? null,
      })
    if (op === 'sync/request') {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      state.requestBodies.push({
        ...body,
        authorization: headers.get('authorization'),
      })
      const { requested } = body
      if (!requested) {
        requests.delete(account)
        return json({ ok: true, requestedAt: null })
      }
      // Asking is signed by the account key too (not checked here).
      if (
        typeof body.payload !== 'string' ||
        typeof body.signature !== 'string'
      )
        return refuse('bad_request', 400)
      // Each envelope works once.
      if (usedEnvelopes.has(body.payload)) return refuse('replay', 409)
      usedEnvelopes.add(body.payload)
      if (state.dropNextAnswer) {
        state.dropNextAnswer = false
        throw new TypeError('Network request failed')
      }
      if (!state.enabled) return refuse('disabled', 503)
      if (!entitled) return refuse('supporter_required', 403)
      if (!requests.has(account)) requests.set(account, state.now ?? Date.now())
      return json({ ok: true, requestedAt: requests.get(account) })
    }
    const slots = slotsOf(account)
    const photos = photosOf(account)
    if (
      op.startsWith('sync/photos/') &&
      state.photoFailure &&
      (state.photoFailure.op ?? op) === op
    ) {
      const { code, status } = state.photoFailure
      state.photoFailure = null
      return json(
        { ok: false, error: code, code, usage: usageOf(account) },
        status
      )
    }
    if (op === 'sync/delete') {
      const { slotId } = JSON.parse(String(init?.body ?? '{}')) as {
        slotId?: string
      }
      state.deletedSlots.push(...(slotId ? [slotId] : [...slots.keys()]))
      if (slotId) slots.delete(slotId)
      else {
        slots.clear()
        photos.clear()
      }
      return json({ ok: true, seq: ++seq })
    }
    if (state.failReads && (op === 'sync/list' || op === 'sync/get'))
      throw new TypeError('Network request failed')
    if (state.failPhotoDeletes && op === 'sync/photos/delete')
      throw new TypeError('Network request failed')
    if (op === 'sync/photos/delete') {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        names?: string[]
        all?: boolean
      }
      let deleted = 0
      if (body.all === true) {
        deleted = photos.size
        photos.clear()
      } else if (
        Array.isArray(body.names) &&
        body.names.length >= 1 &&
        body.names.length <= 100
      ) {
        for (const name of body.names) if (photos.delete(name)) deleted++
      } else return refuse('bad_request', 400)
      state.photoWrites.push({
        op: 'delete',
        slotId: headers.get('x-ww-slot-id'),
      })
      if (deleted) ++seq
      return json({ ok: true, usage: usageOf(account) })
    }
    if (op === 'sync/photos/usage' && method === 'GET')
      return json({ ok: true, usage: usageOf(account) })
    if (!state.enabled) return refuse('disabled', 503)
    if (!entitled) return refuse('supporter_required', 403)
    switch (op) {
      case 'sync/photos/put': {
        if (!state.photos) return refuse('photos_disabled', 503)
        const name = headers.get('x-ww-photo-name') ?? ''
        const meta = headers.get('x-ww-photo-meta') ?? ''
        if (!PHOTO_NAME.test(name) || !meta || meta.length > 512)
          return refuse('bad_request', 400)
        const bytes = new Uint8Array(init!.body as Uint8Array)
        if (bytes.length > MAX_PHOTO_BLOB) return refuse('too_large', 413)
        if (state.photoUploadBytesPerSecond) {
          const took = (bytes.length / state.photoUploadBytesPerSecond) * 1000
          await arrive(took, init?.signal)
          if (took > photoReservationMs(bytes.length))
            return refuse('conflict', 409)
        }
        const live = photos.get(name)
        if (live)
          return json({
            ok: true,
            name,
            size: live.bytes.length,
            sha256: live.sha256,
            createdAt: live.createdAt,
            existed: true,
            usage: usageOf(account),
          })
        const sha256Digest = toB64u(sha256(bytes))
        if (sha256Digest !== headers.get('x-ww-sha256'))
          return refuse('bad_request', 400)
        // Photos are there for Cloud Sync's devices.
        if (slots.size === 0) return refuse('no_slot', 409)
        const usage = usageOf(account)
        if (usage.bytes + bytes.length > state.photoLimitBytes)
          return json(
            { ok: false, error: 'storage_full', code: 'storage_full', usage },
            429
          )
        if (usage.count >= state.photoCountLimit) return refuse('limit', 429)
        const createdAt = (clock = Math.max(clock + 1, Date.now()))
        photos.set(name, { bytes, sha256: sha256Digest, createdAt, meta })
        state.photoWrites.push({
          op: 'put',
          slotId: headers.get('x-ww-slot-id'),
        })
        ++seq
        return json({
          ok: true,
          name,
          size: bytes.length,
          sha256: sha256Digest,
          createdAt,
          existed: false,
          usage: usageOf(account),
        })
      }
      case 'sync/photos/list': {
        const { cursor } = JSON.parse(String(init?.body ?? '{}')) as {
          cursor?: string
        }
        const names = [...photos.keys()].sort()
        const start = cursor ? Number(cursor) : 0
        const page = names.slice(start, start + state.photoPageSize)
        const next = start + page.length
        return json({
          ok: true,
          photos: page.map((name) => {
            const photo = photos.get(name)!
            return {
              name,
              size: photo.bytes.length,
              sha256: photo.sha256,
              createdAt: photo.createdAt,
              meta: photo.meta,
            }
          }),
          cursor: next < names.length ? String(next) : null,
          usage: usageOf(account),
        })
      }
      case 'sync/photos/get': {
        const { name } = JSON.parse(String(init?.body)) as { name: string }
        const photo = photos.get(name)
        if (!photo) return refuse('not_found', 404)
        if (state.photoGetGate) {
          const gate = state.photoGetGate
          await new Promise<void>((resolve, reject) => {
            const onAbort = () =>
              reject(new DOMException('aborted', 'AbortError'))
            init?.signal?.addEventListener('abort', onAbort)
            void gate.then(() => {
              init?.signal?.removeEventListener('abort', onAbort)
              resolve()
            })
          })
        }
        if (state.photoDownloadBytesPerSecond)
          await arrive(
            (photo.bytes.length / state.photoDownloadBytesPerSecond) * 1000,
            init?.signal
          )
        return new Response(photo.bytes.slice(), {
          headers: {
            'content-type': 'application/octet-stream',
            etag: `"${photo.sha256}"`,
            'x-ww-created-at': String(photo.createdAt),
            'cache-control': 'no-store',
          },
        })
      }
      case 'sync/put': {
        if (state.failPuts) return refuse('internal', 500)
        const slotId = headers.get('x-ww-slot-id')!
        const bytes = new Uint8Array(init!.body as Uint8Array)
        const etag = toB64u(sha256(bytes))
        if (etag !== headers.get('x-ww-sha256'))
          return refuse('bad_request', 400)
        const putKey = `${account}/${slotId}`
        const since = Date.now() - (lastPutAt.get(putKey) ?? -Infinity)
        if (since < state.slotPutIntervalMs)
          return new Response(
            JSON.stringify({ ok: false, error: 'rate_limited' }),
            {
              status: 429,
              headers: {
                'content-type': 'application/json',
                'retry-after': String(
                  Math.ceil((state.slotPutIntervalMs - since) / 1000)
                ),
              },
            }
          )
        lastPutAt.set(putKey, Date.now())
        if (state.putDelayMs)
          await new Promise((resolve) => setTimeout(resolve, state.putDelayMs))
        // As the worker: a quoted ETag or `*`, and a re-seal needs the ETag.
        const ifMatch = headers.get('if-match')
        const reseal = headers.get('x-ww-reseal')
        const quoted = ifMatch?.match(/^"([A-Za-z0-9_-]+)"$/)?.[1]
        if (
          (ifMatch !== null && ifMatch !== '*' && !quoted) ||
          (reseal !== null && (reseal !== '1' || !quoted))
        )
          return refuse('bad_request', 400)
        if (reseal && state.resealForbidden) return refuse('forbidden', 403)
        if (state.rateLimitedPuts > 0) {
          state.rateLimitedPuts--
          return new Response(
            JSON.stringify({ ok: false, code: 'rate_limited' }),
            {
              status: 429,
              headers: { 'retry-after': String(state.putRetryAfterSec) },
            }
          )
        }
        state.beforePut?.(slotId)
        const existing = slots.get(slotId)
        if (
          (ifMatch !== null && !existing) ||
          (quoted && existing?.etag !== quoted)
        )
          return refuse('precondition_failed', 412)
        // A re-seal keeps the slot's time.
        const updatedAt = reseal
          ? existing!.updatedAt
          : (clock = Math.max(clock + 1, Date.now()))
        slots.set(slotId, {
          bytes,
          etag,
          updatedAt,
          platform: reseal ? existing!.platform : state.platform,
        })
        if (!reseal) {
          ended.delete(account)
          endedSlots.delete(putKey)
        }
        return json({
          ok: true,
          etag,
          size: bytes.length,
          updatedAt,
          seq: ++seq,
        })
      }
      case 'sync/list':
        return json({
          ok: true,
          seq,
          slots: [...slots].map(([slotId, slot]) => ({
            slotId,
            etag: slot.etag,
            size: slot.bytes.length,
            updatedAt: slot.updatedAt,
            platform: slot.platform,
            ...(!state.listOmitsLive && {
              live:
                !ended.has(account) && !endedSlots.has(`${account}/${slotId}`),
            }),
          })),
        })
      case 'sync/get': {
        const { slotId } = JSON.parse(String(init?.body)) as { slotId: string }
        const slot = slots.get(slotId)
        if (!slot) return refuse('not_found', 404)
        return new Response(slot.bytes.slice(), {
          headers: { 'content-type': 'application/octet-stream' },
        })
      }
    }
    return refuse('not_found', 404)
  }

  return {
    state,
    fetch: fetchImpl,
    /** The account change sequence, as the live socket's `hello` says it. */
    seq: () => seq,
    /** Ends every session that wrote an account's slots (`live: false`). */
    endSessions: (account: string) => ended.add(account),
    /** Replaces a slot's bytes with ones no key opens. */
    damageSlot: (account: string, slotId: string) => {
      const slot = slotsOf(account).get(slotId)
      if (!slot) return
      slot.bytes = new Uint8Array(slot.bytes.length).fill(7)
      slot.etag = toB64u(sha256(slot.bytes))
    },
    /** Ends the session that last wrote one slot. */
    endSlotSession: (account: string, slotId: string) =>
      endedSlots.add(`${account}/${slotId}`),
    /** Says another platform's session last wrote a slot. */
    setSlotPlatform: (
      account: string,
      slotId: string,
      platform: SlotPlatform
    ) => {
      const slot = slotsOf(account).get(slotId)
      if (slot) slot.platform = platform
    },
    /** An account's standing Cloud Sync request, or null. */
    requestedAt: (account: string) => requests.get(account) ?? null,
    /** The slot ids an account holds. */
    slotIds: (account: string) => [...slotsOf(account).keys()].sort(),
    /** What a slot holds, as the server sees it: ciphertext. */
    slotBytes: (account: string, slotId: string) =>
      slotsOf(account).get(slotId)?.bytes ?? null,
    /** The keyed photo names an account holds. */
    photoNames: (account: string) => [...photosOf(account).keys()].sort(),
    /** What a photo holds, as the server sees it: ciphertext. */
    photoBytes: (account: string, name: string) =>
      photosOf(account).get(name)?.bytes ?? null,
    /** Stores a photo as another client would (a damaged meta, say). */
    putPhoto: (account: string, name: string, photo: Photo) =>
      photosOf(account).set(name, photo),
    photoUsage: usageOf,
    /** Puts a slot as another device would, without a request. */
    seed: (account: string, slotId: string, bytes: Uint8Array) => {
      const updatedAt = (clock = Math.max(clock + 1, Date.now()))
      slotsOf(account).set(slotId, {
        bytes,
        etag: toB64u(sha256(bytes)),
        updatedAt,
        platform: state.platform,
      })
      seq++
    },
    /** A slot's time, as the listing has it. */
    slotUpdatedAt: (account: string, slotId: string) =>
      slotsOf(account).get(slotId)?.updatedAt ?? null,
  }
}
