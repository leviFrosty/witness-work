export const KEEP_FILES = 'KEEP_FILES'

type Worker = {
  state: string
  postMessage: (message: unknown) => void
  addEventListener: (type: 'statechange', listener: () => void) => void
}

type Registration = {
  installing: Worker | null
  waiting: Worker | null
  active: Worker | null
  addEventListener: (type: 'updatefound', listener: () => void) => void
}

export type GuestWorkerContainer = {
  register: (
    url: string,
    options: { scope: string; updateViaCache: 'none' }
  ) => Promise<Registration>
}

const FILE_PREFIXES = ['/_expo/static/js/web/', '/assets/']

export function loadedFiles(
  entries: readonly { name: string }[],
  origin: string
): string[] {
  const files = new Set<string>()
  for (const { name } of entries) {
    let url: URL
    try {
      url = new URL(name, origin)
    } catch {
      continue
    }
    if (
      url.origin === origin &&
      !url.search &&
      FILE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
    )
      files.add(url.pathname)
  }
  return [...files]
}

export async function keepGuestPage(
  container: GuestWorkerContainer,
  scriptURL: string,
  scope: string,
  loaded: () => string[]
) {
  const registration = await container.register(scriptURL, {
    scope,
    updateViaCache: 'none',
  })
  const send = (worker: Worker | null) => {
    const urls = loaded()
    if (worker?.state === 'activated' && urls.length > 0)
      worker.postMessage({ type: KEEP_FILES, urls })
  }
  const watch = (worker: Worker | null) => {
    send(worker)
    worker?.addEventListener('statechange', () => send(worker))
  }
  watch(registration.installing ?? registration.waiting ?? registration.active)
  registration.addEventListener('updatefound', () =>
    watch(registration.installing)
  )
  return { keep: () => send(registration.active) }
}
