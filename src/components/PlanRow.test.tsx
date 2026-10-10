import React, { type ReactNode } from 'react'
import moment from 'moment'
import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Category } from '@/types/category'
import type { DayPlan, PlanListItem } from '@/types/timeEntry'

const categoriesState = vi.hoisted(() => ({
  current: [] as Category[],
}))
const navigation = vi.hoisted(() => ({ navigate: vi.fn() }))
const publisher = vi.hoisted(() => ({ showsTimeEntry: true }))

vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))

vi.mock('lucide-react-native', () => ({
  Calendar1: 'Calendar1',
  Repeat: 'Repeat',
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => navigation,
}))
vi.mock('@/hooks/usePublisher', () => ({ default: () => publisher }))
vi.mock('@/components/ui/ContextMenu', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children, ...props }: { children?: ReactNode }) =>
      ReactModule.createElement('ContextMenu', props, children),
  }
})
vi.mock('@/components/RichLinkCard', async () => {
  const { openLinksMenuItem } = await import('@/components/openLinksMenuItem')
  const open = vi.fn()
  return {
    useLinkActions: () => ({
      open,
      copyText: vi.fn(),
      openLinksItem: (text: string | null | undefined) =>
        openLinksMenuItem(text, open),
    }),
  }
})
vi.mock('@/lib/placeSearch', () => ({
  appleMapsUrl: () => 'https://maps.apple.com/?q=Hall',
}))
vi.mock('@/lib/links', () => ({ openURL: vi.fn() }))

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
vi.mock('@/components/RichNoteText', () => ({ default: () => null }))
vi.mock('@/components/PlanLocationLink', () => ({
  default: () => null,
  planLocationText: () => 'Hall',
}))
vi.mock('@/lib/linkPreview', () => ({
  findLinks: (text: string) => text.match(/https?:\/\/\S+/g) ?? [],
  getHostname: (url: string) => new URL(url).hostname,
}))

vi.mock('@/stores/categories', () => ({
  default: (selector?: (state: { categories: Category[] }) => unknown) => {
    const state = { categories: categoriesState.current }
    return selector ? selector(state) : state
  },
}))
vi.mock('@/stores/serviceReport', () => ({ default: { getState: vi.fn() } }))
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
  isRecurringPlanAnytimeOnDate: (plan: { anytime?: boolean }) => !!plan.anytime,
}))

import PlanRow from '@/components/PlanRow'
import type { RecurringPlan } from '@/lib/recurrence'
import { flattenMenu, menuGroups, isSubmenu } from '@/components/ui/menuEntries'
import type {
  ContextMenuEntries,
  ContextMenuItem,
} from '@/components/ui/ContextMenu.types'

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

  it('leaves Standard plans unlabeled', () => {
    let row: ReturnType<typeof create>
    act(() => {
      row = create(
        <PlanRow
          item={{
            type: 'day',
            date: new Date(2026, 7, 27),
            plan: dayPlan('standard-plan'),
          }}
        />
      )
    })
    expect(visibleText(row!.toJSON())).not.toContain('Standard')
  })

  const renderMenu = (item: PlanListItem) => {
    let row: ReturnType<typeof create>
    act(() => {
      row = create(<PlanRow item={item} />)
    })
    const menu = row!.root.findByType('ContextMenu' as never)
    return {
      groups: menuGroups(menu.props.actions as ContextMenuEntries),
      preview: menu.props.preview,
      press: menu.props.onPress as () => void,
    }
  }
  const ids = (groups: ContextMenuItem[][]) =>
    groups.map((group) => group.map((item) => item.id))

  const past = new Date(2026, 7, 27)
  const future = moment().add(3, 'days').toDate()

  it('opens Plan Details on press and the Plan form from Edit', () => {
    const { groups, press } = renderMenu({
      type: 'day',
      date: past,
      plan: dayPlan('p1'),
    })
    press()
    expect(navigation.navigate).toHaveBeenLastCalledWith('Plan Details', {
      dayPlanId: 'p1',
    })
    flattenMenu(groups)
      .find(({ key }) => key === 'edit')!
      .action.onPress()
    expect(navigation.navigate).toHaveBeenLastCalledWith('PlanDay', {
      date: past.toISOString(),
      existingDayPlanId: 'p1',
    })
  })

  it("opens a Recurring Plan's date on press", () => {
    const plan = {
      id: 'r1',
      startDate: past,
      minutes: 60,
      recurrence: { frequency: 0, interval: 1, endDate: null },
    } as unknown as RecurringPlan
    renderMenu({ type: 'recurring', date: past, plan }).press()
    expect(navigation.navigate).toHaveBeenLastCalledWith('Plan Details', {
      recurringPlanId: 'r1',
      date: past.toISOString(),
    })
  })

  it('offers edit, log, duplicate and delete for a past Day Plan', () => {
    const { groups } = renderMenu({
      type: 'day',
      date: past,
      plan: dayPlan('p1'),
    })
    expect(ids(groups)).toEqual([
      ['edit', 'log_as_time', 'duplicate'],
      ['delete'],
    ])
    const [remove] = groups[1]
    expect(!isSubmenu(remove) && remove.destructive).toBe(true)
  })

  it('hides Log as Time for future plans and for publishers not logging hours', () => {
    expect(
      ids(
        renderMenu({ type: 'day', date: future, plan: dayPlan('p1') }).groups
      )[0]
    ).toEqual(['edit', 'duplicate'])

    publisher.showsTimeEntry = false
    expect(
      ids(
        renderMenu({ type: 'day', date: past, plan: dayPlan('p1') }).groups
      )[0]
    ).toEqual(['edit', 'duplicate'])
    publisher.showsTimeEntry = true
  })

  it('folds location, links and note into the menu', () => {
    const plan = {
      ...dayPlan('p1'),
      location: { name: 'Hall' },
      note: 'See https://jw.org and https://wol.jw.org',
    }
    const { groups } = renderMenu({ type: 'day', date: past, plan })
    expect(ids(groups)[1]).toEqual([
      'open_in_maps',
      'copy_address',
      'open_link',
      'copy_note',
    ])
    const links = groups[1][2]
    expect(isSubmenu(links) && links.actions.map((a) => a.title)).toEqual([
      'jw.org',
      'wol.jw.org',
    ])
  })

  it('duplicates into a new plan prefilled from this one', () => {
    const plan = { ...dayPlan('p1', 'metro'), note: 'Bring tracts' }
    const { groups } = renderMenu({ type: 'day', date: past, plan })
    const leaves = flattenMenu(groups)
    leaves.find(({ key }) => key === 'duplicate')!.action.onPress()
    expect(navigation.navigate).toHaveBeenCalledWith('PlanDay', {
      date: past.toISOString(),
      prefill: {
        startTime: moment(past).startOf('day').add(9, 'hours').toISOString(),
        minutes: 60,
        note: 'Bring tracts',
        title: undefined,
        location: undefined,
        categoryId: 'metro',
      },
    })
  })

  it('offers each recurring delete scope in a Delete submenu', () => {
    const plan = {
      id: 'r1',
      startDate: past,
      minutes: 60,
      recurrence: { frequency: 0, interval: 1, endDate: null },
    } as unknown as RecurringPlan
    const { groups } = renderMenu({ type: 'recurring', date: past, plan })
    const remove = groups[groups.length - 1][0]
    expect(isSubmenu(remove) && remove.actions.map((a) => a.id)).toEqual([
      'instance',
      'future',
      'all',
    ])
  })

  it('previews the whole note only when the row clips it', () => {
    const short = renderMenu({
      type: 'day',
      date: past,
      plan: { ...dayPlan('p1'), note: 'Short' },
    })
    expect(short.preview).toBeUndefined()

    const long = renderMenu({
      type: 'day',
      date: past,
      plan: { ...dayPlan('p1'), note: 'word '.repeat(60) },
    })
    expect(long.preview).toBeTruthy()
  })
})
