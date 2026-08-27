import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Category } from '@/types/category'
import type { DayPlan } from '@/types/timeEntry'

const categoriesState = vi.hoisted(() => ({
  current: [] as Category[],
}))

vi.mock('lucide-react-native', () => ({
  Calendar1: 'Calendar1',
  Pencil: 'Pencil',
  Repeat: 'Repeat',
  Trash2: 'Trash2',
}))

vi.mock('react-native', async () => {
  const ReactModule = await import('react')
  const Host = ({ children }: { children?: ReactNode }) =>
    ReactModule.createElement('View', null, children)

  return {
    Alert: { alert: vi.fn() },
    View: Host,
  }
})

vi.mock('react-native-gesture-handler', async () => {
  const ReactModule = await import('react')
  return {
    Swipeable: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Swipeable', null, children),
  }
})

vi.mock('@/components/ui/LucideIcon', () => ({ default: () => null }))
vi.mock('@/components/ui/MyText', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Text', null, children),
  }
})
vi.mock('@/components/ui/Button', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Button', null, children),
  }
})
vi.mock('@/components/ui/Copyeable', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Copyeable', null, children),
  }
})
vi.mock('@/components/ui/Badge', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Badge', null, children),
  }
})
vi.mock('@/components/ui/swipeableActions/Delete', () => ({
  default: () => null,
}))
vi.mock('@/components/RowActionsMenu', () => ({
  default: () => null,
}))

vi.mock('@/stores/categories', () => ({
  default: (selector?: (state: { categories: Category[] }) => unknown) => {
    const state = { categories: categoriesState.current }
    return selector ? selector(state) : state
  },
}))
vi.mock('@/stores/serviceReport', () => ({
  default: () => ({
    deleteDayPlan: vi.fn(),
    deleteRecurringPlan: vi.fn(),
    deleteSingleEventFromRecurringPlan: vi.fn(),
    deleteEventAndFutureEvents: vi.fn(),
  }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {
      accent: '#00f',
      accentTranslucent: '#ccf',
      background: '#fff',
      backgroundLighter: '#eee',
      border: '#ddd',
      text: '#000',
      textAlt: '#555',
    },
    fonts: { semiBold: 'SemiBold' },
    fontSize: () => 12,
    numbers: { borderRadiusMd: 8 },
  }),
}))
vi.mock('@/lib/haptics', () => ({ default: { light: vi.fn() } }))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string) =>
      ({ standard: 'Standard', today: 'Today', type: 'Type' })[key] ?? key,
  },
}))
vi.mock('@/lib/minutes', () => ({
  useFormattedMinutes: (minutes: number) => ({ formatted: `${minutes}m` }),
}))
vi.mock('@/lib/dates', () => ({
  formatDate: () => 'August 27, 2026',
  formatStartTime: () => '9:00 AM',
  formatWeekdayDayCompact: () => 'Thu 27',
  formatWeekdayMonthDayCompact: () => 'Thu, Aug 27',
}))
vi.mock('@/components/ui/Card', () => ({
  useCardStyle: () => ({ borderRadius: 8 }),
}))
vi.mock('@/lib/normalizeDate', () => ({
  DEFAULT_START_TIME_IN_MINUTES: 12 * 60,
  getStartTimeInMinutes: (plan: { startTimeInMinutes?: number }) =>
    plan.startTimeInMinutes ?? 12 * 60,
}))
vi.mock('@/lib/recurrence', () => ({
  getEffectiveMinutesForRecurringPlan: (plan: { minutes: number }) =>
    plan.minutes,
  getEffectiveNoteForRecurringPlan: (plan: { note?: string }) => plan.note,
  getEffectiveStartTimeInMinutesForRecurringPlan: (plan: {
    startTimeInMinutes?: number
  }) => plan.startTimeInMinutes ?? 12 * 60,
}))

import PlanRow from '@/components/PlanRow'

const dayPlan = (id: string, categoryId?: string): DayPlan => ({
  id,
  date: new Date(2026, 7, 27),
  minutes: 60,
  startTimeInMinutes: 9 * 60,
  categoryId,
})

const visibleText = (
  node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null
): string => {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(visibleText).join(' ')
  return node.children?.map((child) => visibleText(child)).join(' ') ?? ''
}

describe('PlanRow', () => {
  beforeEach(() => {
    categoriesState.current = [
      { id: 'metro', name: 'Metro', isCredit: false },
      { id: 'credit', name: 'Credit', isCredit: true },
    ]
  })

  it('visibly distinguishes multiple same-day Day Plans by category', () => {
    let rows: ReturnType<typeof create>

    act(() => {
      rows = create(
        <>
          <PlanRow
            item={{
              type: 'day',
              date: new Date(2026, 7, 27),
              plan: dayPlan('metro-plan', 'metro'),
            }}
          />
          <PlanRow
            item={{
              type: 'day',
              date: new Date(2026, 7, 27),
              plan: dayPlan('credit-plan', 'credit'),
            }}
          />
        </>
      )
    })

    const text = visibleText(rows!.toJSON())
    expect(text).toContain('Metro')
    expect(text).toContain('Credit')
    expect(text).not.toContain('Type:')
  })
})
