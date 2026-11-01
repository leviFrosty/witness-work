import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  buildFuse: vi.fn(),
  foreground: new Set<() => void>(),
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
vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: (listener: () => void) => {
    runtime.foreground.add(listener)
    return { remove: () => runtime.foreground.delete(listener) }
  },
}))
vi.mock('@/lib/contactsSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/contactsSearch')>()
  runtime.buildFuse.mockImplementation(actual.buildContactsFuse)
  return { ...actual, buildContactsFuse: runtime.buildFuse }
})

import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import useContactsSearchStore from '@/features/contacts/stores/contactsSearchStore'
import useContactsSorted from '@/features/contacts/hooks/useContactsSorted'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'

type Result = ReturnType<typeof useContactsSorted>

const Probe = ({ onRender }: { onRender: (r: Result) => void }) => {
  onRender(useContactsSorted())
  return null
}

const mount = () => {
  const current = {} as Result
  act(() => {
    create(<Probe onRender={(r) => Object.assign(current, r)} />)
  })
  return { current }
}

const contact = (id: string, name: string): Contact => ({
  id,
  name,
  createdAt: new Date('2025-01-01'),
})

const visit = (
  id: string,
  contactId: string,
  overrides: Partial<Visit> = {}
): Visit => ({
  id,
  contact: { id: contactId },
  date: new Date(),
  isBibleStudy: false,
  ...overrides,
})

beforeEach(() => {
  runtime.buildFuse.mockClear()
  useContacts.setState({
    contacts: [contact('a', 'Ada Lovelace'), contact('b', 'Grace Hopper')],
    customFieldDefs: [],
  })
  useConversations.setState({ conversations: [visit('v1', 'a')] })
  usePreferences.setState({
    contactsFilters: [],
    contactSort: 'az',
    contactSortDirection: 'asc',
    savedContactViews: {},
    activeSavedContactView: null,
  })
  useContactsSearchStore.setState({ search: '' })
})

describe('useContactsSorted search index', () => {
  it('skips building Fuse while the query is empty, even as visits change', () => {
    const { current } = mount()
    expect(current.searchSortedAndFilteredContacts.map((c) => c.id)).toEqual([
      'a',
      'b',
    ])

    act(() => {
      useConversations.setState({
        conversations: [visit('v1', 'a'), visit('v2', 'b')],
      })
    })
    act(() => {
      useContactsSearchStore.setState({ search: '   ' })
    })

    expect(runtime.buildFuse).not.toHaveBeenCalled()
  })

  it('builds Fuse once a query is typed, not on every keystroke', () => {
    const { current } = mount()
    act(() => {
      useContactsSearchStore.setState({ search: 'gra' })
    })
    const builds = runtime.buildFuse.mock.calls.length
    expect(builds).toBeGreaterThan(0)

    act(() => {
      useContactsSearchStore.setState({ search: 'grace' })
    })
    expect(runtime.buildFuse).toHaveBeenCalledTimes(builds)

    expect(current.searchSortedAndFilteredContacts[0]?.id).toBe('b')
  })
})

describe('useContactsSorted while typing', () => {
  it('lets the typed query render before the search catches up', async () => {
    const renders: { typed: string; search: string; ids: string[] }[] = []
    const Typing = () => {
      const typed = useContactsSearchStore((s) => s.search)
      const result = useContactsSorted()
      renders.push({
        typed,
        search: result.search,
        ids: result.searchSortedAndFilteredContacts.map((c) => c.id),
      })
      return null
    }
    act(() => {
      create(<Typing />)
    })
    renders.length = 0

    useContactsSearchStore.setState({ search: 'gra' })
    await vi.waitFor(() => expect(renders.at(-1)?.search).toBe('gra'))

    expect(renders[0]).toEqual({ typed: 'gra', search: '', ids: ['a', 'b'] })

    expect(renders.at(-1)).toEqual({ typed: 'gra', search: 'gra', ids: ['b'] })
  })
})

describe('useContactsSorted across a day change', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 31, 22, 0))
    useConversations.setState({
      conversations: [
        visit('v1', 'a', {
          date: new Date(2026, 9, 30, 10, 0),
          isBibleStudy: true,
        }),
      ],
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const ids = (r: Result) => r.searchSortedAndFilteredContacts.map((c) => c.id)

  it('drops last month’s studies from Active study after midnight', () => {
    usePreferences.setState({ contactsFilters: [{ kind: 'isActiveStudy' }] })
    const { current } = mount()
    expect(ids(current)).toEqual(['a'])

    act(() => {
      vi.advanceTimersByTime(3 * 60 * 60 * 1000)
    })
    expect(ids(current)).toEqual([])
  })

  it('re-buckets Last visit when the app returns on a new day', () => {
    usePreferences.setState({
      contactsFilters: [{ kind: 'pinStaleness', value: 'recent' }],
    })
    const { current } = mount()
    expect(ids(current)).toEqual(['a'])

    vi.setSystemTime(new Date(2026, 10, 14, 9, 0))
    act(() => {
      runtime.foreground.forEach((listener) => listener())
    })
    expect(ids(current)).toEqual([])
  })
})
