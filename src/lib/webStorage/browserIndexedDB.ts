export function browserIndexedDB(): IDBFactory | undefined {
  try {
    return globalThis.indexedDB ?? undefined
  } catch {
    return undefined
  }
}
