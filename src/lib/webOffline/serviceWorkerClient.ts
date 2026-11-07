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
  onWaiting: () => void
  onControllerChange: () => void

  onControlled: () => void
}

export const SKIP_WAITING = 'SKIP_WAITING'

export async function registerWorker(
  container: ContainerLike,
  scriptURL: string,
  handlers: RegistrationHandlers
) {
  const registration = await container.register(scriptURL, {
    scope: '/',
    updateViaCache: 'none',
  })

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

  watch(registration.installing)
  container.addEventListener('controllerchange', handlers.onControllerChange)
  void container.ready.then(handlers.onControlled, () => {})
  announce()
  return {
    skip: () => {
      if (!registration.waiting) return false
      registration.waiting.postMessage({ type: SKIP_WAITING })
      return true
    },
    check: () => registration.update().catch(() => {}),
  }
}

export const UPDATE_CHECK_MS = 60 * 60_000

export function createUpdateChecks(
  check: () => void,
  now: () => number,
  intervalMs = UPDATE_CHECK_MS
) {
  let last = now()
  return {
    due() {
      if (now() - last < intervalMs) return false
      last = now()
      check()
      return true
    },
  }
}
