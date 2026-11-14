import type { AppContext, Environment } from '../types'
import { bytesToBase64Url, sha256Bytes, timingSafeEqual } from '../crypto'
import { isPlainObject } from '../buddies/contracts'
import { readBlobBody } from '../buddies/envelope'
import { buddiesErrorResponse } from '../buddies/errorResponse'
import { readPlainJson } from './auth'
import { guarded } from './signed'
import { caller, refuseUnentitled, syncIndex } from './sync'
import {
  SYNC_ETAG_PATTERN,
  SYNC_HEADERS,
  SYNC_PHOTO_HEADERS,
  SYNC_PHOTO_LIMITS,
  isSyncPhotoMeta,
  isSyncPhotoName,
  isSyncSlotId,
  syncPhotoObjectKey,
} from './syncContracts'
import { isSyncPhotosOn } from './syncSwitch'

/**
 * Cloud Sync photos (witness-work ADR 0040 §6, `docs/cloud-sync-photos.md`):
 * each photo an end-to-end encrypted blob stored once under the account, by
 * an immutable keyed name. The account's `AccountSync` holds the rows, usage,
 * reservations, rates, and purge queue; R2 (`ACCOUNT_PHOTOS`) holds each
 * put's blob at `v1/<accountId>/<name>/<putId>`.
 *
 * Every route is bearer. `photos/put`, `photos/list`, and `photos/get` need
 * Cloud Sync on and an entitled account, as `sync/put` does; `photos/put`
 * also needs the photos switch (`photos_disabled`). `photos/delete` and
 * `photos/usage` always work. Without the photo bucket, `photos/put` and
 * `photos/get` (which need it) are `photos_disabled`, never `disabled`, so
 * the rest of Cloud Sync carries on; list, delete, and usage read the index
 * and keep working. Without the accounts database, `disabled`.
 *
 * `photos/put` counts against the Buddies photo-upload edge tier, the rest
 * against the read tier.
 *
 * Privacy: nothing here logs or reports names, metas, digests, sizes,
 * account ids, bodies, or tokens.
 */

/**
 * `disabled` without the accounts database; for the routes that touch R2
 * (`needsBucket`), `photos_disabled` without the photo bucket.
 */
const unavailableHere = (
  env: Environment,
  needsBucket: boolean
): Response | null =>
  !env.ACCOUNTS_DB
    ? buddiesErrorResponse('disabled')
    : needsBucket && !env.ACCOUNT_PHOTOS
      ? buddiesErrorResponse('photos_disabled')
      : null

/** The optional `x-ww-slot-id` (the writer's own socket isn't told); undefined when malformed. */
const exceptSlot = (c: AppContext): string | null | undefined => {
  const slotId = c.req.header(SYNC_HEADERS.slotId)
  if (slotId == null) return null
  return isSyncSlotId(slotId) ? slotId : undefined
}

/** Reads what's left of a request body, up to a photo's cap, and drops it. */
const drainBody = async (request: Request): Promise<void> => {
  if (!request.body || request.bodyUsed) return
  const reader = request.body.getReader()
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      size += value.byteLength
      if (size > SYNC_PHOTO_LIMITS.blobBytes) {
        await reader.cancel().catch(() => undefined)
        return
      }
    }
  } catch {
    // The client went away; nothing to answer to.
  }
}

/**
 * `photos/put`: the blob as the raw body, with `x-ww-photo-name`,
 * `x-ww-sha256`, `x-ww-photo-meta`, `Content-Length`, and optionally
 * `x-ww-slot-id`. A declared size over the cap is refused before anything
 * else; otherwise the body is always read to the end before the answer. The
 * index reserves the put's size before the body is read, so puts side by
 * side can't pass the limit; a bad body, a failed write, or a refused commit
 * frees it.
 */
const handlePut = guarded('sync/photos/put', async (c) => {
  const declared = c.req.header('content-length')
  const off = unavailableHere(c.env, true)
  if (declared != null && Number(declared) > SYNC_PHOTO_LIMITS.blobBytes)
    return off ?? buddiesErrorResponse('too_large')
  const response = await putPhoto(c, off, declared)
  await drainBody(c.req.raw)
  return response
})

const putPhoto = async (
  c: AppContext,
  off: Response | null,
  declared: string | undefined
): Promise<Response> => {
  if (off) return off
  // Live sessions only, as `sync/put` (ADR 0039).
  const who = await caller(c, 'photoPut', { requireLiveSession: true })
  if ('refusal' in who) return who.refusal
  const { accountId } = who.account
  const refused = await refuseUnentitled(c.env, who.account)
  if (refused) return refused
  if (!(await isSyncPhotosOn(c.env))) return buddiesErrorResponse('photos_disabled')

  const name = c.req.header(SYNC_PHOTO_HEADERS.name)
  const sha256 = c.req.header(SYNC_PHOTO_HEADERS.sha256)
  const meta = c.req.header(SYNC_PHOTO_HEADERS.meta)
  const size = declared == null ? NaN : Number(declared)
  const slot = exceptSlot(c)
  if (
    !isSyncPhotoName(name) ||
    typeof sha256 !== 'string' ||
    !SYNC_ETAG_PATTERN.test(sha256) ||
    !isSyncPhotoMeta(meta) ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    slot === undefined
  )
    return buddiesErrorResponse('bad_request')

  const index = syncIndex(c.env, accountId)
  const begun = await index.beginPhotoPut({ accountId, name, size, sha256, meta })
  if (!begun.ok)
    return buddiesErrorResponse(begun.error, {
      retryAfterSeconds: begun.retryAfterSeconds,
      extras: begun.usage ? { usage: begun.usage } : undefined,
    })
  if ('existed' in begun.value)
    return c.json({ ok: true, ...begun.value.existed, existed: true, usage: begun.value.usage })
  const { reservation } = begun.value

  // From here the put holds its name and its bytes. Unless its commit answers
  // (which frees them itself, stored or refused), whatever ends the put frees
  // them before the answer: a body that fails to arrive (the link dropped, the
  // app was killed), a bad digest, a failed R2 write, or any error. Leaving
  // them for the window to lapse would turn the retry away with 429 for
  // minutes and keep the dead put's bytes counted against the account's room.
  let wrote = false
  let answered = false
  try {
    const body = await readBlobBody(c.req.raw, size, SYNC_PHOTO_LIMITS.blobBytes)
    const digest = body.ok ? await sha256Bytes(body.value) : null
    if (!body.ok || !timingSafeEqual(bytesToBase64Url(digest!), sha256))
      return buddiesErrorResponse(body.ok ? 'bad_request' : body.error)
    wrote = true
    await c.env.ACCOUNT_PHOTOS!.put(
      syncPhotoObjectKey(accountId, name, reservation),
      body.value,
      {
        sha256: Array.from(digest!, (b) => b.toString(16).padStart(2, '0')).join(''),
        httpMetadata: { contentType: 'application/octet-stream' },
      }
    )
    const committed = await index.commitPhotoPut({
      accountId,
      name,
      reservation,
      exceptSlot: slot,
    })
    answered = true
    if (!committed.ok)
      return buddiesErrorResponse(committed.error, {
        extras: committed.usage ? { usage: committed.usage } : undefined,
      })
    const { photo, usage } = committed.value
    return c.json({ ok: true, ...photo, existed: false, usage }, 200, {
      ETag: `"${photo.sha256}"`,
    })
  } finally {
    // A failed write may still have landed, so the next alarm sweeps for its
    // object. If the commit itself threw, the abort only deletes this put's
    // own row, which may already be gone.
    if (!answered) {
      const released = index
        .abortPhotoPut({ name, reservation, wrote })
        .catch(() => undefined)
      // A client that went away cancels what the request still has pending
      // unless the runtime is told to finish it: a put cut off mid-body is
      // exactly that, and the release is what it must not lose.
      try {
        c.executionCtx.waitUntil(released)
      } catch {
        // No ExecutionContext (unit tests): the release still runs, awaited.
      }
      await released
    }
  }
}

/** `photos/list`: live photos by name, a page at a time, with the usage. */
const handleList = guarded('sync/photos/list', async (c) => {
  const off = unavailableHere(c.env, false)
  if (off) return off
  const who = await caller(c, 'read')
  if ('refusal' in who) return who.refusal
  const { accountId } = who.account
  const refused = await refuseUnentitled(c.env, who.account)
  if (refused) return refused
  const body = await readPlainJson(c)
  if (!isPlainObject(body)) return buddiesErrorResponse('bad_request')
  const cursor = body.cursor ?? null
  if (cursor !== null && !isSyncPhotoName(cursor))
    return buddiesErrorResponse('bad_request')
  const page = await syncIndex(c.env, accountId).listPhotos({ cursor })
  return c.json({ ok: true, ...page })
})

/** `photos/get`: a live photo's blob exactly as put. */
const handleGet = guarded('sync/photos/get', async (c) => {
  const off = unavailableHere(c.env, true)
  if (off) return off
  const who = await caller(c, 'read')
  if ('refusal' in who) return who.refusal
  const { accountId } = who.account
  const refused = await refuseUnentitled(c.env, who.account)
  if (refused) return refused
  const body = await readPlainJson(c)
  if (!isPlainObject(body) || !isSyncPhotoName(body.name))
    return buddiesErrorResponse('bad_request')
  const found = await syncIndex(c.env, accountId).photoForGet({
    accountId,
    name: body.name,
  })
  if (!found.ok)
    return buddiesErrorResponse(found.error, {
      retryAfterSeconds: found.retryAfterSeconds,
    })
  const { putId, sha256, createdAt } = found.value
  const object = await c.env.ACCOUNT_PHOTOS!.get(
    syncPhotoObjectKey(accountId, body.name, putId)
  )
  if (!object) return buddiesErrorResponse('not_found')
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(object.size),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${sha256}"`,
      [SYNC_PHOTO_HEADERS.createdAt]: String(createdAt),
    },
  })
})

/**
 * `photos/delete`: `{ names }` (1 to 100) or `{ all: true }`. Idempotent;
 * works while Cloud Sync is off or the account isn't entitled. Needs a live
 * session, as `sync/delete` does.
 */
const handleDelete = guarded('sync/photos/delete', async (c) => {
  const off = unavailableHere(c.env, false)
  if (off) return off
  const body = await readPlainJson(c)
  const slot = exceptSlot(c)
  if (!isPlainObject(body) || slot === undefined)
    return buddiesErrorResponse('bad_request')
  const all = body.all === true && body.names === undefined
  const names = body.names
  const named =
    body.all === undefined &&
    Array.isArray(names) &&
    names.length >= 1 &&
    names.length <= SYNC_PHOTO_LIMITS.deleteNames &&
    names.every(isSyncPhotoName)
  if (!all && !named) return buddiesErrorResponse('bad_request')
  const who = await caller(c, 'read', { requireLiveSession: true })
  if ('refusal' in who) return who.refusal
  const { accountId } = who.account
  const { usage } = await syncIndex(c.env, accountId).deletePhotos({
    accountId,
    names: all ? null : [...new Set(names as string[])],
    exceptSlot: slot,
  })
  return c.json({ ok: true, usage })
})

/** `GET photos/usage`: the account's live photos' size and number, and its limit. */
const handleUsage = guarded('sync/photos/usage', async (c) => {
  const off = unavailableHere(c.env, false)
  if (off) return off
  const who = await caller(c, 'read')
  if ('refusal' in who) return who.refusal
  const usage = await syncIndex(c.env, who.account.accountId).photoUsage()
  return c.json({ ok: true, usage })
})

export const syncPhotoHandlers = {
  put: handlePut,
  list: handleList,
  get: handleGet,
  delete: handleDelete,
  usage: handleUsage,
}
