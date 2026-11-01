import links from '@/constants/links'
import { isOfflineError } from '@/lib/offlineError'
import {
  readCachedManifest,
  writeCachedBundle,
  writeCachedManifest,
} from '@/features/updates/lib/helpCenter/storage'
import {
  parseHelpBundle,
  parseHelpManifest,
} from '@/features/updates/lib/helpCenter/validate'
import { DEFAULT_HELP_LOCALE } from '@/features/updates/lib/helpCenter/locale'
import type {
  HelpBundle,
  HelpLocale,
  HelpManifest,
} from '@/features/updates/types/helpCenter'

export type RefreshFailure = 'offline' | 'http' | 'invalid' | 'storage'

export type RefreshResult =
  | { outcome: 'updated'; bundle: HelpBundle }
  | { outcome: 'unchanged' }
  | {
      outcome: 'failed'
      reason: RefreshFailure
      error?: unknown

      bundle?: HelpBundle
    }

export type RefreshDeps = {
  fetch: typeof fetch
  readManifest: typeof readCachedManifest
  writeManifest: typeof writeCachedManifest
  writeBundle: typeof writeCachedBundle
}

const defaultDeps: RefreshDeps = {
  fetch: (...args) => fetch(...args),
  readManifest: readCachedManifest,
  writeManifest: writeCachedManifest,
  writeBundle: writeCachedBundle,
}

class RefreshError extends Error {
  constructor(
    readonly reason: RefreshFailure,
    readonly cause?: unknown
  ) {
    super(reason)
  }
}

async function request(
  deps: RefreshDeps,
  url: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  try {
    return await deps.fetch(url, { headers })
  } catch (error) {
    throw new RefreshError(isOfflineError(error) ? 'offline' : 'http', error)
  }
}

async function loadManifest(deps: RefreshDeps): Promise<HelpManifest> {
  const cached = deps.readManifest()
  const response = await request(
    deps,
    links.helpCenterManifest,
    cached ? { 'If-None-Match': cached.etag } : {}
  )
  let body: string
  if (response.status === 304 && cached) body = cached.body
  else if (response.ok) body = await response.text()
  else throw new RefreshError('http')

  let manifest: HelpManifest | null = null
  try {
    manifest = parseHelpManifest(JSON.parse(body))
  } catch {}
  if (!manifest) throw new RefreshError('invalid')
  if (response.status !== 304)
    deps.writeManifest(response.headers.get('etag'), body)
  return manifest
}

export async function refreshHelpBundle(
  locale: HelpLocale,
  currentHash: string | undefined,
  deps: RefreshDeps = defaultDeps
): Promise<RefreshResult> {
  try {
    const manifest = await loadManifest(deps)
    const publishedLocale = manifest.locales[locale]
      ? locale
      : DEFAULT_HELP_LOCALE
    const published = manifest.locales[publishedLocale]
    if (!published) throw new RefreshError('invalid')
    if (published.hash === currentHash) return { outcome: 'unchanged' }

    const response = await request(
      deps,

      new URL(published.path, links.helpCenterManifest).toString()
    )
    if (!response.ok) throw new RefreshError('http')
    let bundle: HelpBundle | null = null
    try {
      bundle = parseHelpBundle(await response.json())
    } catch {}
    if (!bundle || bundle.locale !== publishedLocale)
      throw new RefreshError('invalid')

    if (bundle.hash === currentHash) return { outcome: 'unchanged' }

    try {
      await deps.writeBundle(bundle)
    } catch (error) {
      return { outcome: 'failed', reason: 'storage', error, bundle }
    }
    return { outcome: 'updated', bundle }
  } catch (error) {
    if (error instanceof RefreshError)
      return { outcome: 'failed', reason: error.reason, error: error.cause }
    return { outcome: 'failed', reason: 'http', error }
  }
}
