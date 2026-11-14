type Listener = () => Promise<unknown> | void

const listeners = new Set<Listener>()

export function onPullToRefresh(listener: Listener): { remove: () => void } {
  listeners.add(listener)
  return { remove: () => listeners.delete(listener) }
}

export async function pullToRefresh(): Promise<void> {
  await Promise.allSettled(
    [...listeners].map((listener) => Promise.resolve().then(listener))
  )
}
