import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createUpdateChecks,
  registerWorker,
  SKIP_WAITING,
  START_PRECACHE,
  takeNewestWorker,
  type ContainerLike,
  type RegistrationLike,
  type WorkerLike,
} from '@/lib/webOffline/serviceWorkerClient'

function fakeWorker(state = 'installing') {
  const listeners: Array<() => void> = []
  const worker: WorkerLike & { set: (state: string) => void } = {
    state,
    postMessage: vi.fn(),
    addEventListener: (_type, listener) => listeners.push(listener),
    set(next) {
      worker.state = next
      listeners.forEach((listener) => listener())
    },
  }
  return worker
}

function setup({
  controller = {} as unknown,
  waiting = null as WorkerLike | null,
} = {}) {
  const updateFound: Array<() => void> = []
  const controllerChange: Array<() => void> = []
  const registration = {
    waiting,
    installing: null as WorkerLike | null,
    addEventListener: (_t: 'updatefound', l: () => void) => updateFound.push(l),
    update: vi.fn(async () => undefined),
  } satisfies RegistrationLike
  const container = {
    controller,
    register: vi.fn(async () => registration),
    getRegistration: vi.fn(
      async (): Promise<RegistrationLike | undefined> => registration
    ),
    addEventListener: (_t: 'controllerchange', l: () => void) =>
      controllerChange.push(l),
    ready: Promise.resolve(),
  } satisfies ContainerLike
  const handlers = {
    onWaiting: vi.fn(),
    onControllerChange: vi.fn(),
    onControlled: vi.fn(),
  }
  return { registration, container, handlers, updateFound, controllerChange }
}

describe('registerWorker', () => {
  it('registers at the root without the HTTP cache', async () => {
    const { container, handlers } = setup()
    await registerWorker(container, '/sw.js', handlers)
    expect(container.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
  })

  it('reports a new worker that finishes installing under a controlled page', async () => {
    const { registration, handlers, updateFound, container } = setup()
    await registerWorker(container, '/sw.js', handlers)
    const installing = fakeWorker()
    registration.installing = installing
    updateFound.forEach((listener) => listener())
    expect(handlers.onWaiting).not.toHaveBeenCalled()
    registration.waiting = installing
    installing.set('installed')
    expect(handlers.onWaiting).toHaveBeenCalledTimes(1)
  })

  it('reports an update that began installing before the listeners', async () => {
    const installing = fakeWorker()
    const { registration, handlers, container } = setup()
    registration.installing = installing
    await registerWorker(container, '/sw.js', handlers)
    registration.waiting = installing
    installing.set('installed')
    expect(handlers.onWaiting).toHaveBeenCalledTimes(1)
  })

  it('says when no worker is waiting to take over', async () => {
    const { handlers, container } = setup()
    const worker = await registerWorker(container, '/sw.js', handlers)
    expect(worker.skip()).toBe(false)
  })

  it('does not offer an update on a first install', async () => {
    const { registration, handlers, updateFound, container } = setup({
      controller: null,
    })
    await registerWorker(container, '/sw.js', handlers)
    const installing = fakeWorker()
    registration.installing = installing
    registration.waiting = installing
    updateFound.forEach((listener) => listener())
    installing.set('installed')
    expect(handlers.onWaiting).not.toHaveBeenCalled()
  })

  it('finds a worker that was already waiting when the page loaded', async () => {
    const { handlers, container } = setup({ waiting: fakeWorker('installed') })
    await registerWorker(container, '/sw.js', handlers)
    expect(handlers.onWaiting).toHaveBeenCalledTimes(1)
  })

  it('tells the waiting worker to take over, and checks for updates', async () => {
    const waiting = fakeWorker('installed')
    const { registration, handlers, container } = setup({ waiting })
    const worker = await registerWorker(container, '/sw.js', handlers)
    expect(worker.skip()).toBe(true)
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING })
    await worker.check()
    expect(registration.update).toHaveBeenCalled()
  })

  it('holds a new version’s download until the page allows it', async () => {
    const { registration, handlers, updateFound, container } = setup()
    const worker = await registerWorker(container, '/sw.js', handlers)
    const early = fakeWorker()
    registration.installing = early
    updateFound.forEach((listener) => listener())
    expect(early.postMessage).not.toHaveBeenCalled()

    worker.allowPrecache()
    expect(early.postMessage).toHaveBeenCalledWith({ type: START_PRECACHE })

    const later = fakeWorker()
    registration.installing = later
    updateFound.forEach((listener) => listener())
    expect(later.postMessage).toHaveBeenCalledWith({ type: START_PRECACHE })
  })

  it('passes controller changes on', async () => {
    const { handlers, container, controllerChange } = setup()
    await registerWorker(container, '/sw.js', handlers)
    controllerChange.forEach((listener) => listener())
    expect(handlers.onControllerChange).toHaveBeenCalledTimes(1)
  })
})

describe('createUpdateChecks', () => {
  it('checks at most once an interval', () => {
    let now = 0
    const check = vi.fn()
    const checks = createUpdateChecks(check, () => now, 1000)
    expect(checks.due()).toBe(false)
    now = 999
    expect(checks.due()).toBe(false)
    now = 1000
    expect(checks.due()).toBe(true)
    now = 1500
    expect(checks.due()).toBe(false)
    expect(check).toHaveBeenCalledTimes(1)
  })
})

describe('takeNewestWorker', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('has a waiting worker take over', async () => {
    const waiting = fakeWorker('installed')
    const { container, controllerChange } = setup({ waiting })
    const taken = takeNewestWorker(container)
    await vi.waitFor(() =>
      expect(waiting.postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING })
    )
    controllerChange.forEach((listener) => listener())
    await expect(taken).resolves.toBe(true)
  })

  it('downloads an installing worker now, then has it take over', async () => {
    const { registration, container, controllerChange } = setup()
    const installing = fakeWorker()
    registration.installing = installing
    const taken = takeNewestWorker(container)
    await vi.waitFor(() =>
      expect(installing.postMessage).toHaveBeenCalledWith({
        type: START_PRECACHE,
      })
    )
    expect(registration.update).not.toHaveBeenCalled()
    registration.waiting = installing
    installing.set('installed')
    await vi.waitFor(() =>
      expect(installing.postMessage).toHaveBeenCalledWith({
        type: SKIP_WAITING,
      })
    )
    controllerChange.forEach((listener) => listener())
    await expect(taken).resolves.toBe(true)
  })

  it('asks the server for a new version when none is on the way', async () => {
    const { registration, container, controllerChange } = setup()
    const found = fakeWorker()
    registration.update.mockImplementation(async () => {
      registration.installing = found
    })
    const taken = takeNewestWorker(container)
    await vi.waitFor(() =>
      expect(found.postMessage).toHaveBeenCalledWith({ type: START_PRECACHE })
    )
    found.set('installed')
    await vi.waitFor(() =>
      expect(found.postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING })
    )
    controllerChange.forEach((listener) => listener())
    await expect(taken).resolves.toBe(true)
  })

  it('says so when the server has nothing newer', async () => {
    const { container } = setup()
    await expect(takeNewestWorker(container)).resolves.toBe(false)
  })

  it('says so when the new version fails to install', async () => {
    const { registration, container } = setup()
    const installing = fakeWorker()
    registration.installing = installing
    const taken = takeNewestWorker(container)
    await vi.waitFor(() =>
      expect(installing.postMessage).toHaveBeenCalledWith({
        type: START_PRECACHE,
      })
    )
    installing.set('redundant')
    await expect(taken).resolves.toBe(false)
  })

  it('gives up when the new version isn’t ready in time', async () => {
    vi.useFakeTimers()
    const { registration, container } = setup()
    registration.installing = fakeWorker()
    const taken = takeNewestWorker(container, 1000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(taken).resolves.toBe(false)
  })
})
