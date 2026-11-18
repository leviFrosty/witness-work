import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ capture: vi.fn(), focused: true }))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('@react-navigation/native', () => ({
  useIsFocused: () => mocks.focused,
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))

import useInspectorDetail from '@/features/map/hooks/useInspectorDetail'

let result: ReturnType<typeof useInspectorDetail>
let root: ReactTestRenderer
const panelRef = { current: null }

const capture = (next: ReturnType<typeof useInspectorDetail>) => {
  result = next
}

function Probe({ ids, activeId }: { ids: string[]; activeId?: string }) {
  capture(useInspectorDetail({ contactIds: ids, activeId, panelRef }))
  return null
}

const render = (ids: string[], activeId?: string) =>
  act(() => {
    if (root) root.update(<Probe ids={ids} activeId={activeId} />)
    else root = create(<Probe ids={ids} activeId={activeId} />)
  })

afterEach(() => {
  act(() => root?.unmount())
  root = undefined as unknown as ReactTestRenderer
  mocks.capture.mockClear()
})

describe('useInspectorDetail', () => {
  it('opens, counts the open, and closes', async () => {
    await render(['a', 'b'], 'a')
    expect(result.detailId).toBeNull()

    await act(() => result.open('a'))
    expect(result.detailId).toBe('a')
    expect(mocks.capture).toHaveBeenCalledWith('map_contact_details_opened')

    await act(() => result.close())
    expect(result.detailId).toBeNull()
  })

  it('follows the map to another pin', async () => {
    await render(['a', 'b'], 'a')
    await act(() => result.open('a'))
    await render(['a', 'b'], 'b')
    expect(result.detailId).toBe('b')
  })

  it("doesn't follow a selection the panel isn't showing", async () => {
    await render(['a', 'b'], 'c')
    await act(() => result.open('a'))
    await render(['a', 'b'], 'c')
    expect(result.detailId).toBe('a')
  })

  it('closes when the contact leaves the map', async () => {
    await render(['a', 'b'], 'a')
    await act(() => result.open('a'))
    await render(['b'], 'b')
    expect(result.detailId).toBeNull()
    await render(['a', 'b'], 'a')
    expect(result.detailId).toBeNull()
  })
})
