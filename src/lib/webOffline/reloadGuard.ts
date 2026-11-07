export type ReloadRecord = { build: string; at: number }

export type ReloadGuardEnv = {
  read: () => string | null
  write: (value: string) => void
  now: () => number

  build: () => string

  windowMs?: number
}

export const RELOAD_GUARD_KEY = 'ww.staleChunkReload'

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
