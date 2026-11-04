/**
 * Keeps `CloudSyncDefault` from deciding while the account key is being
 * replaced (a recovery key, a QR code; ADR 0030 §7). Leaving the old account
 * turns sync off, which would otherwise start a decision on that account while
 * its session is still open. The hold covers the whole replace and ends even
 * when it throws; the default then decides on whichever account the device is
 * on.
 */
let holds = 0
const listeners = new Set<() => void>()

export const cloudSyncDefaultHeld = () => holds > 0

export async function holdCloudSyncDefault<T>(work: () => Promise<T>) {
  holds += 1
  try {
    return await work()
  } finally {
    holds -= 1
    if (holds === 0) [...listeners].forEach((listener) => listener())
  }
}

/** Called when the last hold ends. Returns the unsubscribe. */
export function onCloudSyncDefaultReleased(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
