export type StorageStatus = {
  /** The browser won't evict the site's data under storage pressure. */
  persisted: boolean
  usage?: number
  quota?: number
}

/**
 * Asks the browser to keep the site's data under storage pressure. Chromium and
 * Safari decide by themselves; Firefox asks the User once. It doesn't stop
 * Safari's 7-day wipe of sites in a browser tab (docs/web-storage.md).
 */
export async function requestPersistentStorage(
  storage: StorageManager | undefined
): Promise<StorageStatus | undefined> {
  if (!storage?.persist) return undefined
  let persisted = false
  try {
    persisted = (await storage.persisted?.()) || (await storage.persist())
  } catch {
    // Refused or unsupported; the data is still saved, just evictable.
  }
  try {
    const { usage, quota } = (await storage.estimate?.()) ?? {}
    return { persisted, usage, quota }
  } catch {
    return { persisted }
  }
}
