import { allowReload, RELOAD_GUARD_KEY } from '@/lib/webOffline/reloadGuard'

export type StaleChunkEnv = {
  probe: (url: string) => Promise<number | null>
  isOffline: () => boolean
  reload: () => void
  guard: Parameters<typeof allowReload>[0]

  onReload?: (url: string) => void
}

export async function reloadForMissingChunk(
  url: string,
  env: StaleChunkEnv
): Promise<boolean> {
  if (env.isOffline()) return false
  const status = await env.probe(url)
  if (status !== 404 && status !== 410) return false
  if (!allowReload(env.guard)) return false
  env.onReload?.(url)
  env.reload()
  return true
}

export function currentBuild(doc: {
  querySelectorAll: (selector: string) => ArrayLike<{ src?: string }>
}): string {
  for (const script of Array.from(
    doc.querySelectorAll('script[src*="/_expo/static/js/web/index-"]')
  )) {
    const name = script.src?.split('/').pop()
    if (name) return name
  }
  return 'unknown'
}

function sessionRecord() {
  try {
    return {
      read: () => globalThis.sessionStorage.getItem(RELOAD_GUARD_KEY),
      write: (value: string) =>
        globalThis.sessionStorage.setItem(RELOAD_GUARD_KEY, value),
    }
  } catch {
    return null
  }
}

export async function onChunkLoadFailed(url: string): Promise<void> {
  const storage = sessionRecord()
  if (!storage || typeof window === 'undefined') return
  try {
    await reloadForMissingChunk(url, {
      probe: async (target) => {
        try {
          const response = await fetch(target, {
            method: 'HEAD',
            cache: 'no-store',
          })
          return response.status
        } catch {
          return null
        }
      },
      isOffline: () => navigator.onLine === false,
      reload: () => window.location.reload(),

      onReload: () =>
        require('@/lib/analytics').analytics.capture('web_stale_chunk_reload'),
      guard: {
        ...storage,
        now: Date.now,
        build: () => currentBuild(document),
      },
    })
  } catch {}
}
