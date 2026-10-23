import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  capture: vi.fn(),
  light: vi.fn(),
}))

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  },
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'visit-1' }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/lib/haptics', () => ({ default: { light: runtime.light } }))

import useConversations from '@/stores/conversationStore'
import { resetToasts, useToasts } from '@/stores/toasts'
import useLogNotAtHome from '@/hooks/useLogNotAtHome'

const mount = () => {
  const current = {} as ReturnType<typeof useLogNotAtHome>
  const Probe = () => {
    Object.assign(current, useLogNotAtHome())
    return null
  }
  act(() => {
    create(<Probe />)
  })
  return current
}

beforeEach(() => {
  runtime.capture.mockClear()
  runtime.light.mockClear()
  useConversations.setState({ conversations: [] })
  resetToasts()
})

describe('useLogNotAtHome', () => {
  it('logs a Not at Home from Contact Details with an Undo toast', () => {
    const notAtHome = mount()
    act(() => {
      notAtHome.logWithUndo(
        { id: 'contact-1', name: 'Ada' },
        { source: 'contact_details' }
      )
    })

    expect(useConversations.getState().conversations).toMatchObject([
      { id: 'visit-1', contact: { id: 'contact-1' }, notAtHome: true },
    ])
    expect(runtime.light).toHaveBeenCalledOnce()
    expect(runtime.capture).toHaveBeenCalledWith('visit_created', {
      not_at_home: true,
      bible_study: false,
      has_follow_up: false,
      reminder_enabled: false,
      source: 'contact_details',
    })
    const [shown] = useToasts.getState().toasts
    expect(shown?.intent).toBe('undo')
    expect(shown?.title).toBe('logVisit_notAtHomeLogged:Ada')

    act(() => shown?.action?.onPress())
    expect(useConversations.getState().conversations).toEqual([])
  })
})
