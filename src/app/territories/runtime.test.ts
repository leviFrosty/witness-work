import { create } from 'zustand'
import { afterEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({
  foreground: new Set<() => void>(),
}))

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('react-native', () => ({ AppState: { currentState: 'active' } }))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: (listener: () => void) => {
    lifecycle.foreground.add(listener)
    return { remove: () => lifecycle.foreground.delete(listener) }
  },
  addBackgroundListener: () => ({ remove: () => {} }),
}))

import type { PersonalLedger } from '@/features/territories/lib/personalSync'
import {
  type TerritoriesState,
  territoriesState,
} from '@/features/territories/stores/territories'
import { startTerritoriesRuntime } from '@/app/territories/runtime'

const SPACE = 'AAAAAAAAAAAAAAAAAAAAAA'

const markedLedger = (): PersonalLedger => ({
  'territory-1': {
    records: {
      h: {
        kind: 'territory',
        data: {
          id: 'territory-1',
          number: '12',
          shared: true,
          space: { id: SPACE, owner: 'owner', at: 1 },
        },
        updatedAt: 2,
      },
    },
    deleted: {},
  },
})

let stop: (() => void) | undefined

afterEach(() => {
  stop?.()
  stop = undefined
  lifecycle.foreground.clear()
})

function run(ledger: PersonalLedger = {}) {
  const store = create<TerritoriesState>()(territoriesState)
  store.setState({ ledger })
  const adopt = vi.fn(async () => {})
  stop = startTerritoriesRuntime({
    engine: {
      syncAll: async () => ({}),
      syncSpace: async () => 'synced',
      openLive: () => new Promise(() => {}),
      cancel: () => {},
    },
    store,
    ready: () => true,
    watchReady: () => () => {},
    watchPrivacy: () => () => {},
    adopt,
    setRunning: () => {},
  })
  return { store, adopt }
}

describe('finding the User’s own spaces from synced marks', () => {
  it('joins a marked space once at start', () => {
    const { adopt } = run(markedLedger())
    expect(adopt).toHaveBeenCalledTimes(1)
    expect(adopt).toHaveBeenCalledWith({
      territoryId: 'territory-1',
      spaceId: SPACE,
      ownerId: 'owner',
      at: 1,
    })
  })

  it('joins a mark that arrives by sync, without retrying on every edit', () => {
    const { store, adopt } = run()
    expect(adopt).not.toHaveBeenCalled()
    store.setState({ ledger: markedLedger() })
    store.setState({ ledger: { ...markedLedger() } })
    expect(adopt).toHaveBeenCalledTimes(1)
    for (const listener of lifecycle.foreground) listener()
    expect(adopt).toHaveBeenCalledTimes(2)
  })
})
