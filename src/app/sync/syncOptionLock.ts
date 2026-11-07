let tail: Promise<unknown> = Promise.resolve()

export function withSyncOptionLock<T>(work: () => Promise<T>): Promise<T> {
  const run = tail.then(work)
  tail = run.catch(() => undefined)
  return run
}
