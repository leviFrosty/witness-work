export type StorageStatus = {
  persisted: boolean
  usage?: number
  quota?: number
}

export async function requestPersistentStorage(
  storage: StorageManager | undefined
): Promise<StorageStatus | undefined> {
  if (!storage?.persist) return undefined
  let persisted = false
  try {
    persisted = (await storage.persisted?.()) || (await storage.persist())
  } catch {}
  try {
    const { usage, quota } = (await storage.estimate?.()) ?? {}
    return { persisted, usage, quota }
  } catch {
    return { persisted }
  }
}
