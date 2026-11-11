import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeEntry } from '@/types/timeEntry'

const mocks = vi.hoisted(() => ({
  entries: [] as { id: string; hours: number; minutes: number; date: Date }[],
  remove: vi.fn(),
  confirm: vi.fn(),
  capture: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('lucide-react-native', () => ({ Pencil: 'Pencil', X: 'X' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {},
    fonts: {},
    fontSize: () => 14,
    numbers: { borderRadiusMd: 16 },
  }),
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  },
}))
vi.mock('@/lib/minutes', () => ({
  formatMinutes: (minutes: number) => ({ formatted: `${minutes}m` }),
}))
vi.mock('@/lib/richText/notes', () => ({
  getNoteText: (entry: { note?: string }) => entry.note,
}))
vi.mock('@/lib/serviceReport', () => ({ timeEntryMode: () => 'hours' }))
vi.mock('@/lib/serviceReportCategory', () => ({
  getCategoryLabel: () => undefined,
  isLdcEntry: () => false,
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/lib/confirmDestructive', () => ({ default: mocks.confirm }))
vi.mock('@/stores/toasts', () => ({ toast: { success: mocks.toast } }))
vi.mock('@/stores/categories', () => ({
  default: () => ({ categories: [] }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => 'decimal',
}))
vi.mock('@/stores/serviceReport', () => ({
  default: (select: (state: unknown) => unknown) =>
    select({ serviceReports: {}, deleteServiceReport: mocks.remove }),
}))
vi.mock('@/features/service-reports/hooks/useReadableAccent', () => ({
  default: () => 'green',
}))
vi.mock('@/features/service-reports/lib/entryDays', () => ({
  entriesOnDay: () => mocks.entries,
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/ContextMenu', () => ({ default: 'ContextMenu' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/touchTarget', () => ({ MIN_TOUCH_TARGET: 44 }))

import DayEntryList from '@/features/service-reports/components/DayEntryList'

const date = new Date(2026, 10, 8, 12)
const entry = (id: string, minutes: number, note?: string) => ({
  id,
  hours: 0,
  minutes,
  date,
  note,
})
let renderer: ReactTestRenderer
const select = vi.fn()
const deleted = vi.fn()
const render = async (editing?: TimeEntry) => {
  await act(async () => {
    renderer = create(
      <DayEntryList
        date={date}
        editing={editing}
        onSelect={select}
        onDeleted={deleted}
      />
    )
  })
}
const rows = () => renderer.root.findAllByType('ContextMenu' as never)
const ids = () => rows().map((row) => row.props.testID)

beforeEach(() => {
  mocks.entries = [entry('a', 45, 'Cart\nwith Ada'), entry('b', 90)]
})
afterEach(async () => {
  await act(async () => renderer.unmount())
  vi.clearAllMocks()
})

describe('DayEntryList', () => {
  it('shows nothing on a day without time', async () => {
    mocks.entries = []
    await render()
    expect(renderer.toJSON()).toBeNull()
  })

  it("names each entry by its time, Type and the note's first line, and opens it on a tap", async () => {
    await render()
    expect(rows().map((row) => row.props.accessibilityLabel)).toEqual([
      '45m, standard · Cart',
      '90m, standard',
    ])
    rows()[1].props.onPress()
    expect(select).toHaveBeenCalledExactlyOnceWith(mocks.entries[1])
  })

  it('deletes an entry from its menu once confirmed', async () => {
    await render(mocks.entries[0])
    expect(rows()[0].props.accessibilityState).toEqual({ selected: true })
    const [, [remove]] = rows()[0].props.actions
    remove.onPress()
    expect(mocks.remove).not.toHaveBeenCalled()
    mocks.confirm.mock.calls[0][0].onConfirm()
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(mocks.entries[0])
    expect(mocks.capture).toHaveBeenCalledWith('time_entry_deleted', {
      source: 'add_time_day_entry',
      entry_mode: 'hours',
    })
    expect(deleted).toHaveBeenCalledExactlyOnceWith(mocks.entries[0])
  })

  it('folds a long day behind a count, keeping the open entry in view', async () => {
    mocks.entries = ['a', 'b', 'c', 'd', 'e'].map((id) => entry(id, 30))
    await render(mocks.entries[3])
    expect(ids()).toEqual([
      'time-entry-day-entry-a',
      'time-entry-day-entry-b',
      'time-entry-day-entry-d',
    ])
    const more = renderer.root.findByType('Button' as never)
    expect(more.findByType('Text' as never).props.children).toBe(
      'timeForm_moreEntries:2'
    )
    await act(async () => more.props.onPress())
    expect(ids()).toHaveLength(5)
    expect(renderer.root.findAllByType('Button' as never)).toHaveLength(0)
  })

  it('keeps the open entry listed after it moves to this day', async () => {
    await render(entry('moved', 60))
    expect(ids()).toEqual([
      'time-entry-day-entry-a',
      'time-entry-day-entry-b',
      'time-entry-day-entry-moved',
    ])
  })
})
