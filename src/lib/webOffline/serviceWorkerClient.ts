/**
 * Registers the app's service worker and reports what the update flow needs
 * (docs/web-offline.md). The browser objects come in as arguments so the logic
 * runs under Node in tests.
 */
export type WorkerLike = {
  state: string
  postMessage: (message: unknown) => void
  addEventListener: (type: 'statechange', listener: () => void) => void
}

export type RegistrationLike = {
  waiting: WorkerLike | null
  installing: WorkerLike | null
  addEventListener: (type: 'updatefound', listener: () => void) => void
  update: () => Promise<unknown>
}

export type ContainerLike = {
  controller: unknown
  register: (
    url: string,
    options: { scope: string; updateViaCache: 'none' }
  ) => Promise<RegistrationLike>
  addEventListener: (type: 'controllerchange', listener: () => void) => void
  ready: Promise<unknown>
}

export type RegistrationHandlers = {
  /** An updated worker is installed and waiting for the User's go-ahead. */
  onWaiting: () => void
  onControllerChange: () => void
  /** A worker controls the page: it opens offline from here. */
  onControlled: () => void
}

/** The message the worker waits for before it takes over. */
export const SKIP_WAITING = 'SKIP_WAITING'

/**
 * Registers `scriptURL`. Resolves with a handle for the update flow: `skip`
 * tells the waiting worker to take over, `check` looks for a newer worker now.
 * Rejects if the browser refuses the worker.
 */
export async function registerWorker(
  container: ContainerLike,
  scriptURL: string,
  handlers: RegistrationHandlers
) {
  const registration = await container.register(scriptURL, {
    scope: '/',
    updateViaCache: 'none',
  })
  // A first install activates at once; only a page already under a worker has
  // an update to offer.
  const announce = () => {
    if (registration.waiting && container.controller) handlers.onWaiting()
  }
  const watch = (installing: WorkerLike | null) => {
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') announce()
    })
  }
  registration.addEventListener('updatefound', () =>
    watch(registration.installing)
  )
  // One that began installing before the listener was added.
  watch(registration.installing)
  container.addEventListener('controllerchange', handlers.onControllerChange)
  void container.ready.then(handlers.onControlled, () => {})
  announce()
  return {
    /** Whether a waiting worker was told to take over. */
    skip: () => {
      if (!registration.waiting) return false
      registration.waiting.postMessage({ type: SKIP_WAITING })
      return true
    },
    check: () => registration.update().catch(() => {}),
  }
}

/** How often a tab left open looks for a newer version. */
export const UPDATE_CHECK_MS = 60 * 60_000

/**
 * Decides when to look for a newer worker: at most every `UPDATE_CHECK_MS`,
 * when a tab comes back to the front or on the hour while it stays there.
 * Browsers only look on navigation, which a tab open for days never makes.
 */
export function createUpdateChecks(
  check: () => void,
  now: () => number,
  intervalMs = UPDATE_CHECK_MS
) {
  let last = now()
  return {
    /** The tab came to the front, or an hour passed. */
    due() {
      if (now() - last < intervalMs) return false
      last = now()
      check()
      return true
    },
  }
}
