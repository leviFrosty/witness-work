import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@/types/contact'

const mocks = vi.hoisted(() => ({ contacts: [] as Partial<Contact>[] }))

vi.mock('@react-navigation/native', async () => {
  const routers = await import('@react-navigation/routers')
  return {
    CommonActions: routers.CommonActions,
    StackActions: routers.StackActions,
    useNavigation: vi.fn(),
  }
})
vi.mock('@/hooks/useAdaptiveLayout', () => ({ default: vi.fn() }))
vi.mock('@/stores/preferences', () => ({ usePreferences: vi.fn() }))
vi.mock('@/stores/contactsStore', () => ({
  default: { getState: () => ({ contacts: mocks.contacts }) },
}))

import { openContactDetails } from '@/hooks/useOpenContact'

const ACTIVE = 'active-contact'
const DISMISSED = 'dismissed-contact'

function navigator(index: number) {
  const dispatch = vi.fn()
  const root = { dispatch, getState: () => ({ index }) }
  const screen = {
    dispatch: vi.fn(),
    getState: () => ({ index: 0 }),
    getParent: () => root,
  }
  return { screen, dispatch }
}

const toSplit = {
  type: 'NAVIGATE',
  payload: {
    name: 'Root',
    params: {
      screen: 'Contacts',
      params: { contactId: ACTIVE, highlightedVisitId: 'visit-1' },
    },
  },
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.contacts = [
    { id: ACTIVE },
    { id: DISMISSED, dismissedUntil: new Date('2999-01-01T00:00:00.000Z') },
  ]
})

afterEach(() => {
  vi.useRealTimers()
})

describe('openContactDetails', () => {
  it('selects the contact in the Contacts split from a tab', () => {
    const { screen, dispatch } = navigator(0)
    openContactDetails(
      screen,
      { id: ACTIVE, highlightedVisitId: 'visit-1' },
      { split: true }
    )
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(toSplit)
    expect(screen.dispatch).not.toHaveBeenCalled()
  })

  it('closes what is open over the tabs before it switches to Contacts', () => {
    const { screen, dispatch } = navigator(2)
    openContactDetails(
      screen,
      { id: ACTIVE, highlightedVisitId: 'visit-1' },
      { split: true, mode: 'replace' }
    )
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'POP_TO_TOP' })
    vi.runAllTimers()
    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(dispatch).toHaveBeenLastCalledWith(toSplit)
  })

  it.each(['navigate', 'push', 'replace'] as const)(
    'opens the full screen with %s when the split is not showing',
    (mode) => {
      const { screen, dispatch } = navigator(1)
      openContactDetails(screen, { id: ACTIVE }, { split: false, mode })
      expect(dispatch).not.toHaveBeenCalled()
      expect(screen.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: mode.toUpperCase(),
          payload: expect.objectContaining({
            name: 'Contact Details',
            params: { id: ACTIVE },
          }),
        })
      )
    }
  )

  it('opens a dismissed contact full screen, since the split lists only active ones', () => {
    const { screen, dispatch } = navigator(1)
    openContactDetails(screen, { id: DISMISSED }, { split: true })
    expect(dispatch).not.toHaveBeenCalled()
    expect(screen.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'NAVIGATE',
        payload: expect.objectContaining({ name: 'Contact Details' }),
      })
    )
  })
})
