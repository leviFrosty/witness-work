import type { MiddlewareHandler } from 'hono'
import type { Environment } from '../types'
import { SCRIBE_KV, parseLegacyNotesImport, readKv } from './config'

/**
 * The hard cutover from Notes Import to Scribe AI (protocol: Legacy
 * cutover). Unless KV `scribe:legacy-notes-import` is `on`, every
 * `/notes-import/*` route except `GET /notes-import/status` answers 426
 * `upgrade_required` (no `Retry-After`) before its rate limit, auth, or kill
 * switch; app versions with sessions show Update Required for it. The status
 * route stays: older versions read attestation capabilities from it to open
 * account sessions.
 *
 * `GET /notes-import/usage` answers 404 instead, as a server from before the
 * route did. Older composers read it every time they open, through the
 * session client, which shows Update Required over the whole app on a 426;
 * a 404 leaves the composer showing its own update message
 * (`notes-import:min-version`), and the rest of the app usable.
 *
 * A failed KV read counts as off (426), like `auth:legacy`: the old routes
 * never come back because KV is down. Older apps show Update Required until
 * the next read succeeds.
 */

export const LEGACY_STATUS_PATH = '/notes-import/status'
export const LEGACY_USAGE_PATH = '/notes-import/usage'

export const isLegacyNotesImportAllowed = async (env: Environment): Promise<boolean> => {
  const read = await readKv(env.NOTES_KV, SCRIBE_KV.legacyNotesImport)
  if (read.failed) console.warn('scribe: legacy Notes Import KV read failed; off')
  return !read.failed && parseLegacyNotesImport(read.value)
}

export const upgradeRequiredResponse = (): Response =>
  Response.json(
    { ok: false, error: 'Update required', code: 'upgrade_required' },
    { status: 426 }
  )

const notFoundResponse = (): Response =>
  Response.json({ ok: false, error: 'not_found', code: 'not_found' }, { status: 404 })

export const notesImportCutover =
  (): MiddlewareHandler<{ Bindings: Environment }> => async (context, next) => {
    const read = context.req.method === 'GET'
    if (read && context.req.path === LEGACY_STATUS_PATH) return next()
    if (await isLegacyNotesImportAllowed(context.env)) return next()
    if (read && context.req.path === LEGACY_USAGE_PATH) return notFoundResponse()
    return upgradeRequiredResponse()
  }

/**
 * `/admin/notes-import/reset` is reachable only while the legacy routes are:
 * otherwise it's the same 404 as an unknown route.
 */
export const legacyAdminGate =
  (): MiddlewareHandler<{ Bindings: Environment }> => async (context, next) => {
    if (await isLegacyNotesImportAllowed(context.env)) return next()
    return notFoundResponse()
  }
