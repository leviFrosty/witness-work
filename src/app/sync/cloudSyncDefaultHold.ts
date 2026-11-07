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

export function onCloudSyncDefaultReleased(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
