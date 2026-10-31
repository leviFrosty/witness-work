/**
 * Where a retired key comes from: `held` when this device's own account says it
 * held the key (a browser forgets it before telling anyone), so nothing needs
 * to still be stored or cached to act on it.
 */
export type KeyRetiredFrom = { held: boolean }

export type KeyRetiredListener = (
  accountPub: string,
  changedAt: number | null,
  from: KeyRetiredFrom
) => void | Promise<void>

/**
 * Tells listeners the account key changed on another device. A browser hears of
 * it at launch, before the app installs its handling: what nobody listened to
 * yet goes to the first listener when it subscribes.
 */
export function createKeyRetiredHub(onError: (error: unknown) => void) {
  const listeners = new Set<KeyRetiredListener>()
  const unheard: {
    args: Parameters<KeyRetiredListener>
    settled: () => void
  }[] = []

  const tell = async (
    listener: KeyRetiredListener,
    args: Parameters<KeyRetiredListener>
  ) => {
    try {
      await listener(...args)
    } catch (error) {
      onError(error)
    }
  }

  return {
    /** Calls `listener` for each retired key. Returns an unsubscribe. */
    subscribe(listener: KeyRetiredListener): () => void {
      listeners.add(listener)
      for (const { args, settled } of unheard.splice(0))
        void tell(listener, args).then(settled)
      return () => listeners.delete(listener)
    },
    /**
     * Tells every listener, and settles once each has. When none listens yet,
     * it keeps it, and settles once the first listener has handled it.
     */
    async emit(...args: Parameters<KeyRetiredListener>): Promise<void> {
      if (listeners.size === 0)
        return new Promise<void>((settled) => unheard.push({ args, settled }))
      await Promise.all([...listeners].map((listener) => tell(listener, args)))
    },
  }
}
