import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  capture: vi.fn(),
  nextId: 0,
}))

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  osName: 'iOS',
  deviceType: 1,
  DeviceType: { TABLET: 2 },
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('expo-crypto', () => ({ randomUUID: () => `view-${++runtime.nextId}` }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))

vi.mock('@/lib/confirmDestructive', () => ({
  default: ({ onConfirm }: { onConfirm: () => void }) => onConfirm(),
}))

import { usePreferences } from '@/stores/preferences'
import useContacts from '@/stores/contactsStore'
import useContactsQuery from '@/features/contacts/hooks/useContactsQuery'
import useSavedContactViews from '@/features/contacts/hooks/useSavedContactViews'

type Hooks = {
  query: ReturnType<typeof useContactsQuery>
  views: ReturnType<typeof useSavedContactViews>
}

const Probe = ({ onRender }: { onRender: (hooks: Hooks) => void }) => {
  onRender({ query: useContactsQuery(), views: useSavedContactViews() })
  return null
}

const mount = () => {
  const current = {} as Hooks
  const onRender = (hooks: Hooks) => Object.assign(current, hooks)
  act(() => {
    create(<Probe onRender={onRender} />)
  })
  return { current }
}

beforeEach(() => {
  runtime.capture.mockClear()
  runtime.nextId = 0
  useContacts.setState({ customFieldDefs: [] })
  usePreferences.setState({
    contactsFilters: [{ kind: 'hasStudy' }],
    contactSort: 'az',
    contactSortDirection: 'asc',
    savedContactViews: {},
    activeSavedContactView: null,
    preferenceUpdatedAt: {},
  })
})

describe('Saved Views', () => {
  it('saves the current filters as a view and switches to it', () => {
    const { current } = mount()
    act(() => {
      current.views.saveCurrent(' Bible studies ')
    })

    const state = usePreferences.getState()
    expect(state.savedContactViews['view-1']).toMatchObject({
      name: 'Bible studies',
      filters: [{ kind: 'hasStudy' }],
      sort: 'az',
      direction: 'asc',
    })
    expect(state.activeSavedContactView).toEqual({ id: 'view-1' })

    expect(state.contactsFilters).toEqual([])
    expect(state.contactSort).toBe('suggested')
    expect(current.query.query.filters).toEqual([{ kind: 'hasStudy' }])
    expect(runtime.capture).toHaveBeenCalledWith('saved_view_created', {
      filter_count: 1,
      sort: 'az',
      view_count: 1,
    })

    act(() => current.views.select(null))
    expect(current.query.query.filters).toEqual([])
  })

  it('keeps edits separate until they are saved back to the view', () => {
    const { current } = mount()
    act(() => {
      current.views.saveCurrent('Studies')
    })
    act(() => current.query.setDirection('desc'))

    expect(current.query.edited).toBe(true)
    expect(
      usePreferences.getState().savedContactViews['view-1'].direction
    ).toBe('asc')
    expect(
      usePreferences.getState().activeSavedContactView?.edits?.direction
    ).toBe('desc')

    act(() => current.views.updateActive())
    expect(current.query.edited).toBe(false)
    expect(
      usePreferences.getState().savedContactViews['view-1'].direction
    ).toBe('desc')
    expect(usePreferences.getState().activeSavedContactView).toEqual({
      id: 'view-1',
    })
  })

  it('reset discards edits to the view', () => {
    const { current } = mount()
    act(() => {
      current.views.saveCurrent('Studies')
    })
    act(() => current.query.setFilters([]))
    expect(current.query.edited).toBe(true)

    act(() => current.query.reset())
    expect(current.query.edited).toBe(false)
    expect(current.query.query.filters).toEqual([{ kind: 'hasStudy' }])
  })

  it('deleting the active view returns to the User’s own filters', () => {
    const { current } = mount()
    act(() => {
      current.views.saveCurrent('Studies')
    })
    act(() => current.views.confirmRemove('view-1'))

    expect(usePreferences.getState().savedContactViews).toEqual({})
    expect(usePreferences.getState().activeSavedContactView).toBeNull()
  })
})
