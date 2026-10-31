import {
  SyncTransportError,
  type TransferPhases,
} from '@/lib/syncTransport/types'

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

/**
 * Like `withTransportTimeout`, but the wait for the transfer itself (`ms`) runs
 * only between the transport's `start` and `end`. Around it (opening the
 * session, reading, sealing, opening, writing the file) the wait is `setupMs`,
 * a backstop against a hang rather than a budget for the link, so a slow phone
 * sealing 25 MiB can't eat the transfer's wait. A transport that never calls
 * `start` gets `setupMs` for the whole operation, which is `ms` unless a caller
 * says otherwise.
 */
export function withTransferTimeout<T>(
  label: string,
  run: (phases: TransferPhases) => Promise<T>,
  ms: number = TRANSPORT_TIMEOUT_MS,
  setupMs: number = ms
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    // Once the wait has ended, an abandoned transfer's late reports arm nothing.
    let settled = false
    const arm = (wait: number) => {
      if (settled) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        settled = true
        reject(new SyncTransportError('network', `${label} timed out`))
      }, wait)
    }
    arm(setupMs)
    run({ start: () => arm(ms), end: () => arm(setupMs) }).then(
      (value) => {
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        settled = true
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}
