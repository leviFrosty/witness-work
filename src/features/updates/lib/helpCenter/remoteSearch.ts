import links from '@/constants/links'
import type { HelpEntry, HelpLocale } from '@/features/updates/types/helpCenter'

export const REMOTE_SEARCH_TIMEOUT_MS = 8000
const LIMIT = 20

export type RemoteSearchParams = {
  query: string
  locale: HelpLocale
  platform: string
  appVersion?: string | null
}

export async function searchHelpRemote(
  params: RemoteSearchParams,
  options: {
    signal?: AbortSignal
    timeoutMs?: number
    fetch?: typeof fetch
  } = {}
): Promise<string[] | null> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort)
  const timer = setTimeout(abort, options.timeoutMs ?? REMOTE_SEARCH_TIMEOUT_MS)
  try {
    const url = new URL(links.helpCenterSearch)
    url.searchParams.set('q', params.query.slice(0, 200))
    url.searchParams.set('locale', params.locale)
    url.searchParams.set('platform', params.platform)
    if (params.appVersion) url.searchParams.set('appVersion', params.appVersion)
    url.searchParams.set('limit', String(LIMIT))
    const response = await (options.fetch ?? fetch)(url.toString(), {
      signal: controller.signal,
    })
    if (response.status !== 200) return null
    const body = (await response.json()) as { results?: unknown }
    if (!Array.isArray(body.results)) return null
    return body.results
      .map((result) =>
        typeof result === 'object' && result !== null
          ? (result as { slug?: unknown }).slug
          : undefined
      )
      .filter((slug): slug is string => typeof slug === 'string')
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}

export function mergeSearchResults(
  remoteSlugs: string[] | null,
  entries: HelpEntry[],
  local: HelpEntry[]
): { results: HelpEntry[]; source: 'local' | 'remote' } {
  if (!remoteSlugs?.length) return { results: local, source: 'local' }
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]))
  const seen = new Set<string>()
  const results: HelpEntry[] = []
  for (const slug of remoteSlugs) {
    const entry = bySlug.get(slug)
    if (!entry || seen.has(slug)) continue
    seen.add(slug)
    results.push(entry)
  }
  return results.length
    ? { results, source: 'remote' }
    : { results: local, source: 'local' }
}
