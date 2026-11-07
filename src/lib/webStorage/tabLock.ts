export const ACTIVE_TAB_LOCK = 'witnesswork-active-tab'

const WRITER_TIMEOUT_MS = 5_000

type Options = {
  locks: LockManager | undefined
  name?: string

  takeOver?: boolean

  onTakenOver: () => Promise<void> | void
  writerTimeoutMs?: number
}

const forever = () => new Promise<never>(() => {})

export function claimTab({
  locks,
  name = ACTIVE_TAB_LOCK,
  takeOver = false,
  onTakenOver,
  writerTimeoutMs = WRITER_TIMEOUT_MS,
}: Options): Promise<boolean> {
  if (!locks?.request) return Promise.resolve(true)
  const writer = `${name}:writer`
  let releaseWriter: (() => void) | undefined

  const takeWriter = () =>
    new Promise<void>((granted) => {
      const hold = () => {
        clearTimeout(timer)
        granted()
        return new Promise<void>((release) => (releaseWriter = release))
      }
      const waiting = new AbortController()
      const timer = setTimeout(() => {
        waiting.abort()
        void locks.request(writer, { steal: true }, hold).catch(() => {})
      }, writerTimeoutMs)
      void locks
        .request(writer, { signal: waiting.signal }, hold)
        .catch(() => {})
    })

  return new Promise((resolve) => {
    locks
      .request(
        name,
        takeOver ? { steal: true } : { ifAvailable: true },
        async (lock) => {
          if (!lock) return resolve(false)
          await takeWriter()
          resolve(true)

          return forever()
        }
      )
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') {
          void Promise.resolve(onTakenOver()).finally(() => releaseWriter?.())
        } else {
          resolve(true)
        }
      })
  })
}
