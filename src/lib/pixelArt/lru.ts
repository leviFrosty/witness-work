export interface LruCache<V> {
  get(key: string): V | undefined
  set(key: string, value: V): V

  getOrCreate(key: string, create: () => V): V
  clear(): void
  readonly size: number
}

export function createLru<V>(capacity: number): LruCache<V> {
  const map = new Map<string, V>()
  const cache: LruCache<V> = {
    get(key) {
      const v = map.get(key)
      if (v === undefined) return undefined
      map.delete(key)
      map.set(key, v)
      return v
    },
    set(key, value) {
      map.delete(key)
      map.set(key, value)
      while (map.size > capacity) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
      }
      return value
    },
    getOrCreate(key, create) {
      const hit = cache.get(key)
      return hit !== undefined ? hit : cache.set(key, create())
    },
    clear() {
      map.clear()
    },
    get size() {
      return map.size
    },
  }
  return cache
}
