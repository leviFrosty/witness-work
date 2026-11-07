export type KeyRetiredFrom = { held: boolean }

export type KeyRetiredListener = (
  accountPub: string,
  changedAt: number | null,
  from: KeyRetiredFrom
) => void | Promise<void>

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
    subscribe(listener: KeyRetiredListener): () => void {
      listeners.add(listener)
      for (const { args, settled } of unheard.splice(0))
        void tell(listener, args).then(settled)
      return () => listeners.delete(listener)
    },

    async emit(...args: Parameters<KeyRetiredListener>): Promise<void> {
      if (listeners.size === 0)
        return new Promise<void>((settled) => unheard.push({ args, settled }))
      await Promise.all([...listeners].map((listener) => tell(listener, args)))
    },
  }
}
