import { SyncTransportError } from '@/lib/syncTransport/types'

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
