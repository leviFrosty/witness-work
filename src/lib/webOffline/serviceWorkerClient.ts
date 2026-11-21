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
  getRegistration: () => Promise<RegistrationLike | undefined>
}

export type RegistrationHandlers = {
  onWaiting: () => void
  onControllerChange: () => void

  onControlled: () => void
}

export const SKIP_WAITING = 'SKIP_WAITING'

export const START_PRECACHE = 'START_PRECACHE'

const startPrecache = (worker: WorkerLike | null) =>
  worker?.postMessage({ type: START_PRECACHE })

export async function registerWorker(
  container: ContainerLike,
  scriptURL: string,
  handlers: RegistrationHandlers
) {
  const registration = await container.register(scriptURL, {
    scope: '/',
    updateViaCache: 'none',
  })

  let precacheAllowed = false
  const announce = () => {
    if (registration.waiting && container.controller) handlers.onWaiting()
  }
  const watch = (installing: WorkerLike | null) => {
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') announce()
    })
  }
  registration.addEventListener('updatefound', () => {
    watch(registration.installing)
    if (precacheAllowed) startPrecache(registration.installing)
  })

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

    allowPrecache: () => {
      precacheAllowed = true
      startPrecache(registration.installing)
    },
  }
}

export const TAKE_NEWEST_TIMEOUT_MS = 20_000

function installedWorker(
  registration: RegistrationLike
): Promise<WorkerLike | null> {
  const { installing } = registration
  if (registration.waiting) return Promise.resolve(registration.waiting)
  if (!installing) return Promise.resolve(null)
  return new Promise((resolve) => {
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') resolve(installing)
      if (installing.state === 'redundant') resolve(null)
    })
  })
}

export async function takeNewestWorker(
  container: ContainerLike,
  timeoutMs = TAKE_NEWEST_TIMEOUT_MS
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })
  const take = async () => {
    const registration = await container.getRegistration()
    if (!registration) return false
    if (!registration.installing && !registration.waiting)
      await registration.update().catch(() => {})
    startPrecache(registration.installing)
    const waiting = await installedWorker(registration)
    if (!waiting) return false
    const changed = new Promise<true>((resolve) =>
      container.addEventListener('controllerchange', () => resolve(true))
    )
    waiting.postMessage({ type: SKIP_WAITING })
    return changed
  }
  try {
    return await Promise.race([take(), deadline])
  } finally {
    clearTimeout(timer)
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
