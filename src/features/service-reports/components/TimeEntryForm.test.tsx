import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  update: vi.fn(),
  done: vi.fn(),
  confetti: vi.fn(),
  toast: vi.fn(),
  noteAction: vi.fn(),
  heavy: vi.fn(),
  capture: vi.fn(),
  planned: vi.fn(),
  logged: vi.fn(),
  categories: [] as { id: string; name: string; isCredit: boolean }[],
}))
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
  View: 'View',
}))
vi.mock('@/hooks/useFormAtTopOnWeb', () => ({ default: () => false }))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'new-entry' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, fontSize: () => 16 }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
vi.mock('@/lib/minutes', () => ({
  useFormattedMinutes: (minutes: number) => ({ formatted: `${minutes}m` }),
}))
vi.mock('@/hooks/useOpenNoteEditor', () => ({
  useOpenNoteEditor: () => vi.fn(),
}))
vi.mock('@/components/ui/Card', () => ({ useCardStyle: () => ({}) }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ role: 'pioneer', publisherHours: { pioneer: 0 } }),
}))
vi.mock('@/stores/categories', () => ({
  default: () => ({ categories: mocks.categories }),
}))
vi.mock('@/stores/serviceReport', () => ({
  default: () => ({
    addServiceReport: mocks.add,
    updateServiceReport: mocks.update,
    serviceReports: {},
    dayPlans: [],
    recurringPlans: [],
  }),
}))
vi.mock('@/lib/serviceReport', () => ({
  getReport: (_: unknown, entry: unknown) =>
    entry ? { report: entry } : undefined,
  getMonthsReports: () => [],
  adjustedMinutesForSpecificMonth: () => ({ value: 0 }),
  timeEntryMode: () => 'hours',
}))
vi.mock('@/lib/monthlyGoals', () => ({ resolveMonthlyGoalHours: () => 0 }))
vi.mock('@/lib/roleHistory', () => ({
  roleForMonth: () => 'pioneer',
  calendarMonthOf: () => ({ year: 2026, month: 9 }),
}))
vi.mock('@/hooks/usePublisher', () => ({
  default: () => ({ hasAnnualGoal: false, annualGoalHours: 0 }),
}))
vi.mock('@/features/service-reports/lib/timeSavedProgress', () => ({
  timeSavedProgress: () => ({ added: 'added', progress: 'progress' }),
}))
vi.mock('@/hooks/useAnimation', () => ({
  default: () => ({ playConfetti: mocks.confetti }),
}))
vi.mock('@/lib/haptics', () => ({
  default: { heavy: mocks.heavy, success: vi.fn() },
}))
vi.mock('@/providers/AnimationViewProvider', () => ({ CONFETTI_DELAY_MS: 0 }))
vi.mock('@/features/service-reports/stores/celebrationQueue', () => ({
  default: {},
}))
vi.mock('@/features/service-reports/lib/monthlyGoalCelebration', () => ({
  didCrossMonthlyGoal: () => false,
}))
vi.mock('@/lib/userAction', () => ({ noteUserAction: mocks.noteAction }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/stores/toasts', () => ({ toast: { success: mocks.toast } }))
vi.mock('@/lib/richText/notes', () => ({
  getNoteDoc: () => undefined,
  hasNote: () => false,
  noteFields: () => ({}),
}))
vi.mock('@/lib/richText/inspect', () => ({ richTextImages: () => [] }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/ActionButton', () => ({ default: 'ActionButton' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/layout/DockedFormLayout', () => ({
  default: (props: { dock: React.ReactNode; children: React.ReactNode }) =>
    React.createElement('DockedFormLayout', props, props.children, props.dock),
}))
vi.mock('@/components/TypeFormRow', () => ({ default: 'TypeFormRow' }))
vi.mock('@/features/service-reports/components/DurationInput', () => ({
  default: 'DurationInput',
}))
vi.mock('@/features/service-reports/components/DetailRow', () => ({
  default: 'DetailRow',
}))
vi.mock('@/features/service-reports/components/EntryDayPicker', () => ({
  default: 'EntryDayPicker',
}))
vi.mock('@/features/service-reports/components/DayEntryList', () => ({
  default: 'DayEntryList',
}))
vi.mock('@/features/service-reports/components/DayPlanSuggestion', () => ({
  default: 'DayPlanSuggestion',
}))
vi.mock('@/features/service-reports/lib/entryDays', () => ({
  dayPlanSuggestion: mocks.planned,
  loggedMinutesOnDays: mocks.logged,
}))
vi.mock('@/features/service-reports/components/MonthPreview', () => ({
  default: 'MonthPreview',
}))
vi.mock('@/components/TypeSelectorRow', () => ({
  CUSTOM_TYPE_VALUE: '__custom__',
  STANDARD_TYPE_VALUE: 'standard',
}))

import { Alert } from 'react-native'
import TimeEntryForm from '@/features/service-reports/components/TimeEntryForm'
import { localDayKey } from '@/lib/normalizeDate'
let renderer: ReactTestRenderer
const saveLabel = () =>
  renderer.root.findByType('ActionButton' as never).props.children
async function pressSave() {
  await act(async () =>
    renderer.root.findByType('ActionButton' as never).props.onPress()
  )
}
const suggestions = () =>
  renderer.root.findAllByType('DayPlanSuggestion' as never)
const dayEntries = () => renderer.root.findByType('DayEntryList' as never)
const duration = () => renderer.root.findByType('DurationInput' as never)
const logged = { id: 'logged', hours: 1, minutes: 0, date: new Date() }
beforeEach(() => {
  mocks.planned.mockReturnValue(undefined)
  mocks.logged.mockReturnValue(new Map())
  mocks.categories = []
})
afterEach(async () => {
  await act(async () => renderer.unmount())
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('Time Entry submission', () => {
  it.each(['docked', 'inline'] as const)(
    'keeps %s Add enabled and guards writes and success effects until duration is entered',
    async (layout) => {
      vi.useFakeTimers()
      await act(async () => {
        renderer = create(
          <TimeEntryForm
            source='time_entry_form'
            layout={layout}
            onDone={mocks.done}
          />
        )
      })
      expect(
        renderer.root.findByType('ActionButton' as never).props.disabled
      ).toBeUndefined()
      await pressSave()
      expect(mocks.add).not.toHaveBeenCalled()
      expect(mocks.confetti).not.toHaveBeenCalled()
      expect(mocks.heavy).not.toHaveBeenCalled()
      expect(mocks.noteAction).not.toHaveBeenCalled()
      expect(mocks.toast).not.toHaveBeenCalled()
      expect(mocks.done).not.toHaveBeenCalled()
      const duration = () => renderer.root.findByType('DurationInput' as never)
      expect(duration().props.invalid).toBe(true)
      expect(saveLabel()).toBe('addTime')
      await act(async () => {
        duration().props.setDuration(1, 0)
        duration().props.onInput('preset')
      })
      expect(duration().props.invalid).toBe(false)

      expect(saveLabel()).toBe('timeForm_addDuration')
      await pressSave()
      expect(mocks.add).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ hours: 1, minutes: 0 })
      )
      expect(mocks.capture).toHaveBeenCalledWith(
        'time_entry_created',
        expect.objectContaining({
          duration_input: 'preset',
          date_input: 'kept',
        })
      )
      expect(mocks.toast).toHaveBeenCalledExactlyOnceWith('added', {
        message: 'progress',
      })
      expect(mocks.done).toHaveBeenCalledOnce()
    }
  )

  it('guards editing Save while a Custom category has not been added', async () => {
    await act(async () => {
      renderer = create(
        <TimeEntryForm
          source='time_entry_form'
          existingReport={{
            id: 'existing',
            hours: 1,
            minutes: 0,
            date: new Date(),
          }}
          onDone={mocks.done}
        />
      )
    })
    await act(async () =>
      renderer.root
        .findByType('TypeFormRow' as never)
        .props.onChange({ value: '__custom__', category: null })
    )
    await pressSave()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.done).not.toHaveBeenCalled()
    expect(renderer.root.findByType('TypeFormRow' as never).props.invalid).toBe(
      true
    )
    await act(async () =>
      renderer.root
        .findByType('TypeFormRow' as never)
        .props.onChange({ value: 'standard', category: null })
    )
    await pressSave()
    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.done).toHaveBeenCalledOnce()
  })
  it('saves on the day picked among the recent days', async () => {
    await act(async () => {
      renderer = create(
        <TimeEntryForm source='time_entry_form' hours={2} onDone={mocks.done} />
      )
    })
    const picked = new Date(2026, 10, 8, 9)
    await act(async () =>
      renderer.root
        .findByType('EntryDayPicker' as never)
        .props.setDate(picked, 'day')
    )
    await pressSave()
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ date: picked, hours: 2 })
    )
    expect(mocks.capture).toHaveBeenCalledWith(
      'time_entry_created',
      expect.objectContaining({
        duration_input: 'prefilled',
        date_input: 'day',
      })
    )
  })

  it("fills in the day's planned time and Type when asked", async () => {
    mocks.categories = [{ id: 'ldc', name: 'LDC', isCredit: true }]
    mocks.planned.mockReturnValue({ minutes: 150, categoryId: 'ldc' })
    await act(async () => {
      renderer = create(
        <TimeEntryForm source='time_entry_form' onDone={mocks.done} />
      )
    })
    expect(suggestions()).toHaveLength(1)
    expect(suggestions()[0].props).toMatchObject({
      minutes: 150,
      applied: false,
    })
    await act(async () => suggestions()[0].props.onPress())
    expect(suggestions()[0].props.applied).toBe(true)
    expect(renderer.root.findByType('TypeFormRow' as never).props.value).toBe(
      'ldc'
    )
    await pressSave()
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        hours: 2,
        minutes: 30,
        categoryId: 'ldc',
        credit: true,
      })
    )
    expect(mocks.capture).toHaveBeenCalledWith(
      'time_entry_created',
      expect.objectContaining({ duration_input: 'plan' })
    )
  })

  it('offers no planned time once the day has time, or while editing', async () => {
    mocks.planned.mockReturnValue({ minutes: 150 })
    mocks.logged.mockImplementation(
      (_: unknown, days: Date[]) =>
        new Map(days.map((day) => [localDayKey(day), 60]))
    )
    await act(async () => {
      renderer = create(
        <TimeEntryForm source='time_entry_form' onDone={mocks.done} />
      )
    })
    expect(suggestions()).toHaveLength(0)
    await act(async () => renderer.unmount())

    mocks.logged.mockReturnValue(new Map())
    await act(async () => {
      renderer = create(
        <TimeEntryForm
          source='time_entry_form'
          existingReport={{
            id: 'existing',
            hours: 1,
            minutes: 0,
            date: new Date(),
          }}
          onDone={mocks.done}
        />
      )
    })
    expect(suggestions()).toHaveLength(0)
  })
})

describe("Editing the chosen day's entries from Add Time", () => {
  it('opens an entry in the form, saves it, and returns to the new entry', async () => {
    const editing = vi.fn()
    await act(async () => {
      renderer = create(
        <TimeEntryForm
          source='time_entry_form'
          hours={2}
          onDone={mocks.done}
          onEditingChange={editing}
        />
      )
    })
    expect(dayEntries().props.editing).toBeUndefined()
    await act(async () => dayEntries().props.onSelect(logged))
    expect(dayEntries().props.editing).toMatchObject({ id: 'logged' })
    expect(saveLabel()).toBe('save')
    expect(duration().props.hours).toBe(1)
    expect(editing).toHaveBeenLastCalledWith(true)

    await act(async () => duration().props.setDuration(3, 0))
    await pressSave()
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'logged', hours: 3 })
    )
    expect(mocks.capture).toHaveBeenCalledWith(
      'time_entry_updated',
      expect.objectContaining({ source: 'add_time_day_entry' })
    )
    expect(mocks.done).not.toHaveBeenCalled()
    expect(editing).toHaveBeenLastCalledWith(false)
    expect(saveLabel()).toBe('timeForm_addDuration')
    expect(duration().props.hours).toBe(2)

    await pressSave()
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'new-entry', hours: 2 })
    )
    expect(mocks.done).toHaveBeenCalledOnce()
  })

  it('closes an unchanged entry when its row or its day is tapped again', async () => {
    await act(async () => {
      renderer = create(
        <TimeEntryForm source='time_entry_form' onDone={mocks.done} />
      )
    })
    await act(async () => dayEntries().props.onSelect(logged))
    await act(async () => dayEntries().props.onSelect(logged))
    expect(saveLabel()).toBe('addTime')
    expect(Alert.alert).not.toHaveBeenCalled()

    await act(async () => dayEntries().props.onSelect(logged))
    await act(async () =>
      renderer.root
        .findByType('EntryDayPicker' as never)
        .props.setDate(logged.date, 'day')
    )
    expect(saveLabel()).toBe('addTime')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('asks before dropping changes to an entry', async () => {
    await act(async () => {
      renderer = create(
        <TimeEntryForm source='time_entry_form' onDone={mocks.done} />
      )
    })
    await act(async () => dayEntries().props.onSelect(logged))
    await act(async () => duration().props.setDuration(3, 0))
    await act(async () => dayEntries().props.onSelect(logged))
    expect(saveLabel()).toBe('save')
    const [title, , buttons] = vi.mocked(Alert.alert).mock.calls[0]
    expect(title).toBe('discardChanges')
    await act(async () => buttons?.[1].onPress?.())
    expect(saveLabel()).toBe('addTime')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('returns to the new entry when the open entry is deleted from the list', async () => {
    await act(async () => {
      renderer = create(
        <TimeEntryForm source='time_entry_form' onDone={mocks.done} />
      )
    })
    await act(async () => dayEntries().props.onSelect(logged))
    await act(async () => dayEntries().props.onDeleted(logged))
    expect(saveLabel()).toBe('addTime')
    expect(dayEntries().props.editing).toBeUndefined()
  })

  it('lists no entries while editing an entry opened from elsewhere', async () => {
    await act(async () => {
      renderer = create(
        <TimeEntryForm
          source='time_entry_form'
          existingReport={logged}
          onDone={mocks.done}
        />
      )
    })
    expect(renderer.root.findAllByType('DayEntryList' as never)).toHaveLength(0)
    await pressSave()
    expect(mocks.done).toHaveBeenCalledOnce()
  })
})

describe('Add Another', () => {
  it('offers to add another entry on the same day after one is added', async () => {
    const another = vi.fn()
    await act(async () => {
      renderer = create(
        <TimeEntryForm
          source='time_entry_form'
          hours={1}
          onDone={mocks.done}
          onAddAnother={another}
        />
      )
    })
    const picked = new Date(2026, 10, 8, 9)
    await act(async () =>
      renderer.root
        .findByType('EntryDayPicker' as never)
        .props.setDate(picked, 'day')
    )
    await pressSave()
    const { action } = mocks.toast.mock.calls[0][1]
    expect(action.label).toBe('timeForm_addAnother')
    action.onPress()
    expect(another).toHaveBeenCalledExactlyOnceWith(picked)
    expect(mocks.capture).toHaveBeenCalledWith('time_entry_add_another')
  })

  it('offers nothing where the form stays on its day', async () => {
    await act(async () => {
      renderer = create(
        <TimeEntryForm source='day_sheet' hours={1} onDone={mocks.done} />
      )
    })
    await pressSave()
    expect(mocks.toast.mock.calls[0][1].action).toBeUndefined()
  })
})
