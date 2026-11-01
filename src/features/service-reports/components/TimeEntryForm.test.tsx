import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  update: vi.fn(),
  done: vi.fn(),
  confetti: vi.fn(),
  toast: vi.fn(),
  noteAction: vi.fn(),
  heavy: vi.fn(),
  capture: vi.fn(),
}))
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
  View: 'View',
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'new-entry' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, fontSize: () => 16 }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ role: 'pioneer', publisherHours: { pioneer: 0 } }),
}))
vi.mock('@/stores/categories', () => ({ default: () => ({ categories: [] }) }))
vi.mock('@/stores/serviceReport', () => ({
  default: () => ({
    addServiceReport: mocks.add,
    updateServiceReport: mocks.update,
    serviceReports: {},
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
vi.mock('@/components/ui/inputs/FormDetailsSection', () => ({
  default: 'FormDetailsSection',
}))
vi.mock('@/components/ui/inputs/Section', () => ({ default: 'Section' }))
vi.mock('@/components/ui/inputs/NoteFormRow', () => ({
  default: 'NoteFormRow',
}))
vi.mock('@/components/TypeFormRow', () => ({ default: 'TypeFormRow' }))
vi.mock('@/components/TypeSelectorRow', () => ({
  CUSTOM_TYPE_VALUE: '__custom__',
  STANDARD_TYPE_VALUE: 'standard',
}))

vi.mock('@/components/WhenDock', () => ({
  default: (props: { saveButton: React.ReactNode }) =>
    React.createElement('WhenDock', props, props.saveButton),
}))

import TimeEntryForm from '@/features/service-reports/components/TimeEntryForm'
let renderer: ReactTestRenderer
async function pressSave() {
  await act(async () =>
    renderer.root.findByType('ActionButton' as never).props.onPress()
  )
}
afterEach(async () => {
  await act(async () => renderer.unmount())
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('Time Entry submission', () => {
  it.each(['docked', 'inline'] as const)(
    'keeps %s Submit enabled and guards writes and success effects until duration is entered',
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
      expect(
        renderer.root.findByType('WhenDock' as never).props.durationInvalid
      ).toBe(true)
      await act(async () =>
        renderer.root.findByType('WhenDock' as never).props.setDuration(1, 0)
      )
      expect(
        renderer.root.findByType('WhenDock' as never).props.durationInvalid
      ).toBe(false)
      await pressSave()
      expect(mocks.add).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ hours: 1, minutes: 0 })
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
})
