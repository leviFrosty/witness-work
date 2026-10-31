/**
 * The browser's IndexedDB, or undefined: on iOS and Android, and in browsers
 * that throw on reading it when site data is blocked.
 */
export function browserIndexedDB(): IDBFactory | undefined {
  try {
    return globalThis.indexedDB ?? undefined
  } catch {
    return undefined
  }
}
