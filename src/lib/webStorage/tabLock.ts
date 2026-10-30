/**
 * One tab at a time works with the User's data. Every tab keeps the stores in
 * memory and saves them whole, so two tabs editing at once would overwrite each
 * other's changes. The active tab holds a Web Lock for as long as it's open;
 * another tab shows "open in another tab" until the User takes over there,
 * which steals the lock and makes the first tab stand down.
 *
 * The active tab also holds a second, "writer" lock. Stealing the tab lock is
 * instant, but the first tab only stops writing once it hears about it, so the
 * tab taking over waits for the writer lock, which the first tab lets go once
 * its last writes are saved. Only then may it read the stores.
 */
export const ACTIVE_TAB_LOCK = 'witnesswork-active-tab'

/** How long a takeover waits for a tab that never lets go (frozen, hung). */
const WRITER_TIMEOUT_MS = 5_000

type Options = {
  locks: LockManager | undefined
  name?: string
  /** Take the lock from the tab that has it. */
  takeOver?: boolean
  /** Another tab took over: stop writing; resolve once the last writes landed. */
  onTakenOver: () => Promise<void> | void
  writerTimeoutMs?: number
}

const forever = () => new Promise<never>(() => {})

/** True when this tab is the active one. */
export function claimTab({
  locks,
  name = ACTIVE_TAB_LOCK,
  takeOver = false,
  onTakenOver,
  writerTimeoutMs = WRITER_TIMEOUT_MS,
}: Options): Promise<boolean> {
  // Browsers from before Web Locks (Safari 15.3 and older) run every tab as
  // the active one.
  if (!locks?.request) return Promise.resolve(true)
  const writer = `${name}:writer`
  let releaseWriter: (() => void) | undefined

  /** Waits for the writer lock, then holds it until `releaseWriter`. */
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
          // Held until the page goes away.
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
