import {
  SyncTransportError,
  type TransferPhases,
} from '@/lib/syncTransport/types'

export const TRANSPORT_TIMEOUT_MS = 60_000

export const TRANSPORT_READ_TIMEOUT_MS = 120_000

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

export function withTransferTimeout<T>(
  label: string,
  run: (phases: TransferPhases) => Promise<T>,
  ms: number = TRANSPORT_TIMEOUT_MS,
  setupMs: number = ms
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined

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
