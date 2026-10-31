let tail: Promise<unknown> = Promise.resolve()

/**
 * Runs `work` once no other sync option change is running, and holds the next
 * one until it ends. A switch (`switchSyncOption`, from Settings, the offer,
 * the account's Cloud Sync request) and Cloud Sync's default
 * (`CloudSyncDefault`) each go through here, so two never set up the engine at
 * once; the one that waited reads the option the other left.
 */
export function withSyncOptionLock<T>(work: () => Promise<T>): Promise<T> {
  const run = tail.then(work)
  tail = run.catch(() => undefined)
  return run
}
