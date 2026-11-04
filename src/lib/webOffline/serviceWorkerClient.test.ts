import { describe, expect, it, vi } from 'vitest'
import {
  createUpdateChecks,
  registerWorker,
  SKIP_WAITING,
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
