import { SyncTransportError } from '@/lib/syncTransport/types'

/**
 * Longest the engine waits for one transport write, delete or photo transfer.
 * iCloud's `NSFileCoordinator` and Drive's file transfers have no timeout of
 * their own, and a call that never settles would hold the push (and every later
 * sync) until the app restarts.
 */
export const TRANSPORT_TIMEOUT_MS = 60_000
/** Reads can download several files, each with its own retries. */
export const TRANSPORT_READ_TIMEOUT_MS = 120_000

/**
 * Rejects with a `network` `SyncTransportError` when `operation` takes longer
 * than `ms`. The operation itself keeps running; callers treat the timeout as a
 * failure and keep whatever they still owe (the pending-push flag) for a
 * retry.
 */
export function withTransportTimeout<T>(
  label: string,
  operation: Promise<T>,
  ms: number = TRANSPORT_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new SyncTransportError('network', `${label} timed out`)),
      ms
    )
    operation.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}
