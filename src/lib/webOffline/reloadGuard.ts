/**
 * Reloads a stale tab once (docs/web-offline.md). A tab left open across a
 * deploy asks for chunks the new version no longer has; reloading fetches the
 * new version. But a reload that doesn't fix it must not become a loop, so a
 * tab reloads once per build it was running, and the record lives in
 * `sessionStorage`, which survives the reload and dies with the tab.
 */
export type ReloadRecord = { build: string; at: number }

export type ReloadGuardEnv = {
  read: () => string | null
  write: (value: string) => void
  now: () => number
  /** The build this page runs, e.g. its entry chunk's file name. */
  build: () => string
  /** How long one build's reload counts, in ms. */
  windowMs?: number
}

export const RELOAD_GUARD_KEY = 'ww.staleChunkReload'

/** One reload per build, however long the tab then stays open. */
export const RELOAD_WINDOW_MS = 10 * 60_000

function parse(value: string | null): ReloadRecord | null {
  if (!value) return null
  try {
    const record = JSON.parse(value) as Partial<ReloadRecord>
    return typeof record.build === 'string' && typeof record.at === 'number'
      ? { build: record.build, at: record.at }
      : null
  } catch {
    return null
  }
}

/**
 * Returns true, and records it, if this build may reload now; false if it
 * already reloaded within the window. Another build (the reload worked) starts
 * over, and so does a record from long ago.
 */
export function allowReload(env: ReloadGuardEnv): boolean {
  const build = env.build()
  const now = env.now()
  const last = parse(env.read())
  const windowMs = env.windowMs ?? RELOAD_WINDOW_MS
  if (
    last &&
    last.build === build &&
    now >= last.at &&
    now - last.at < windowMs
  )
    return false
  env.write(JSON.stringify({ build, at: now } satisfies ReloadRecord))
  return true
}
