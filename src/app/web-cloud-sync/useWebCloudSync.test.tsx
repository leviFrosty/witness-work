import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebCloudSyncClient } from '@/app/web-cloud-sync/webCloudSyncClient'
import type { WebCloudSyncSlot } from '@/app/web-cloud-sync/webCloudSyncGate'

const runtime = vi.hoisted(() => ({
  appStateListeners: [] as Array<(state: string) => void>,
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appStateListeners.push(listener)
      return {
        remove: () => {
          runtime.appStateListeners = runtime.appStateListeners.filter(
            (l) => l !== listener
          )
        },
      }
    },
  },
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/syncClock', () => ({ syncNow: () => Date.now() }))
vi.mock('@/stores/toasts', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const phoneSlot: WebCloudSyncSlot = {
  slotId: 'slot-phone001',
  platform: 'ios',
  live: true,
  updatedAt: Date.now(),
}

/** An account with one phone and no slots, until the test says otherwise. */
const fakeClient = () => {
  const server = {
    slots: [] as WebCloudSyncSlot[],
    requestedAt: null as number | null,
  }
  const client: WebCloudSyncClient = {
    listSlots: vi.fn(async () => server.slots),
    listSessions: vi.fn(async () => [{ platform: 'ios', appVersion: null }]),
    readRequestedAt: vi.fn(async () => server.requestedAt),
    requestCloudSync: vi.fn(async () => (server.requestedAt = Date.now())),
  }
  return { server, client }
}

let renderer: ReactTestRenderer | null = null
type Hook = { state: string | null; turnOn: () => Promise<void> }
const seen: Hook[] = []
/** The hook as it last rendered. */
const hook = {
  get state() {
    return seen[seen.length - 1].state
  },
  turnOn: () => seen[seen.length - 1].turnOn(),
}

async function mount(client: WebCloudSyncClient, onReady = vi.fn()) {
  const { useWebCloudSync } = await import(
    '@/app/web-cloud-sync/useWebCloudSync'
  )
  function Probe() {
    seen.push(useWebCloudSync({ client, ownSlotId: 'slot-browser1', onReady }))
    return null
  }
  await act(async () => {
    renderer = create(<Probe />)
  })
  return onReady
}

const foreground = () =>
  act(async () => {
    runtime.appStateListeners.forEach((listener) => listener('active'))
  })

beforeEach(() => {
  vi.clearAllMocks()
  runtime.appStateListeners = []
  seen.length = 0
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

describe('useWebCloudSync', () => {
  it('turns on, waits, and goes on once a phone’s slot is there', async () => {
    const { server, client } = fakeClient()
    const onReady = await mount(client)
    expect(hook.state).toBe('turnOn')

    await act(() => hook.turnOn())
    expect(client.requestCloudSync).toHaveBeenCalledTimes(1)
    expect(hook.state).toBe('waiting')

    server.slots = [phoneSlot]
    await foreground()
    expect(hook.state).toBe('ready')
    expect(onReady).toHaveBeenCalledTimes(1)
    await foreground()
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('asks again once ww-api says the request lapsed', async () => {
    const { server, client } = fakeClient()
    await mount(client)
    await act(() => hook.turnOn())
    expect(hook.state).toBe('waiting')

    server.requestedAt = null
    await foreground()
    expect(hook.state).toBe('turnOn')
  })

  it('keeps waiting when a read from before this page asked comes back late', async () => {
    const { server, client } = fakeClient()
    await mount(client)
    // The read starts, then the User taps Turn On before it answers.
    let answer = (_: number | null) => {}
    vi.mocked(client.readRequestedAt).mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve))
    )
    runtime.appStateListeners.forEach((listener) => listener('active'))
    await act(() => hook.turnOn())
    expect(hook.state).toBe('waiting')
    await act(async () => {
      answer(null)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(hook.state).toBe('waiting')
    expect(server.requestedAt).not.toBeNull()
  })
})
