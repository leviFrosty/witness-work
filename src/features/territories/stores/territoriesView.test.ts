import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => new Map<string, string>())

vi.mock('@/stores/mmkv', () => ({
  MmkvStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  },
}))

import { useTerritoriesView } from '@/features/territories/stores/territoriesView'

const saved = () => JSON.parse(storage.get('territories-view')!).state

describe('useTerritoriesView', () => {
  beforeEach(() => {
    useTerritoriesView.getState().reset()
  })

  it('turns a filter on and off', () => {
    const { toggleFilter } = useTerritoriesView.getState()
    toggleFilter('streetsLeft')
    toggleFilter('overdue')
    expect(useTerritoriesView.getState().filters).toEqual([
      'overdue',
      'streetsLeft',
    ])
    toggleFilter('overdue')
    expect(useTerritoriesView.getState().filters).toEqual(['streetsLeft'])
    useTerritoriesView.getState().clearFilters()
    expect(useTerritoriesView.getState().filters).toEqual([])
  })

  it('keeps the choice on the device across launches', async () => {
    useTerritoriesView.getState().setSort('number')
    useTerritoriesView.getState().setDirection('asc')
    useTerritoriesView.getState().toggleFilter('notHome')
    const blob = storage.get('territories-view')!
    expect(saved()).toEqual({
      sort: 'number',
      direction: 'asc',
      filters: ['notHome'],
    })
    useTerritoriesView.getState().reset()
    storage.set('territories-view', blob)
    await useTerritoriesView.persist.rehydrate()
    expect(useTerritoriesView.getState()).toMatchObject({
      sort: 'number',
      direction: 'asc',
      filters: ['notHome'],
    })
  })

  it('drops a saved sort or filter it does not know', async () => {
    storage.set(
      'territories-view',
      JSON.stringify({
        state: {
          sort: 'distance',
          direction: 'sideways',
          filters: ['shared', 'overdue'],
        },
        version: 0,
      })
    )
    await useTerritoriesView.persist.rehydrate()
    expect(useTerritoriesView.getState()).toMatchObject({
      sort: 'recent',
      direction: 'desc',
      filters: ['overdue'],
    })
  })
})
