import { allowReload, RELOAD_GUARD_KEY } from '@/lib/webOffline/reloadGuard'

/**
 * A stale tab's missing chunk (docs/web-offline.md). A tab open across a deploy
 * asks for `/_expo/static/js/web/<oldhash>.js`; the web host answers a real 404
 * for a file the new version doesn't have. This confirms that's why a chunk
 * failed (not a dropped connection, which a reload wouldn't fix) and reloads
 * the tab once per build (`allowReload`).
 */
export type StaleChunkEnv = {
  /**
   * Asks the server for the chunk again; the HTTP status, or null if it didn't
   * answer.
   */
  probe: (url: string) => Promise<number | null>
  isOffline: () => boolean
  reload: () => void
  guard: Parameters<typeof allowReload>[0]
  /** For analytics. */
  onReload?: (url: string) => void
}

/** Whether the failure was a stale tab, and the page reloaded for it. */
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

/** The build a page runs: its entry chunk's file name, or `unknown`. */
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

/**
 * The browser's `sessionStorage` as the guard's storage; null where it's
 * blocked.
 */
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

/**
 * A chunk's download failed: reloads this tab if the server no longer has it.
 * Never throws. Without `sessionStorage` (blocked) it doesn't reload, since
 * nothing could stop a loop.
 */
export async function onChunkLoadFailed(url: string): Promise<void> {
  const storage = sessionRecord()
  if (!storage || typeof window === 'undefined') return
  try {
    await reloadForMissingChunk(url, {
      probe: async (target) => {
        try {
          // Not through the page's cache: the server's answer now.
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
      // Loaded now: a chunk can fail before the app's own modules have.
      onReload: () =>
        require('@/lib/analytics').analytics.capture('web_stale_chunk_reload'),
      guard: {
        ...storage,
        now: Date.now,
        build: () => currentBuild(document),
      },
    })
  } catch {
    // A reload that can't happen leaves the page as it was.
  }
}
