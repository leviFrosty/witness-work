import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('react-native-mmkv', () => ({ MMKV: class {} }))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))
vi.mock('@/lib/haptics', () => ({
  default: { light: () => Promise.resolve() },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/stores/preferences', async () => ({
  usePreferences: (await import('zustand')).create(() => ({
    readingPlanRunId: 'plan-1' as string | null,
    worshipKind: 'family',
  })),
}))
vi.mock('@/stores/pet', async () => ({
  default: (await import('zustand')).create(() => ({ pet: null })),
}))

import { planPortionCount, planProgress } from '@/lib/routine/readingPlans'
import useRoutine from '@/stores/routine'
import { resetToasts, useToasts } from '@/stores/toasts'
import type { ReadingPlanRun } from '@/types/routine'
import {
  markPortionRead,
  toggleHabit,
  unmarkPortionRead,
} from '@/features/routine/lib/checkHabit'
import { usePlanCelebration } from '@/features/routine/stores/planCelebration'

const TODAY = '2026-11-07'

const RUN: ReadingPlanRun = {
  id: 'plan-1',
  kind: 'custom',
  startBook: 65,
  chaptersPerDay: 10,
  startedOn: '2026-11-01',
  updatedAt: 1,
}

const entry = () =>
  useRoutine.getState().routineEntries.find((e) => e.on === TODAY)
const plan = () => useRoutine.getState().readingPlans[0]
const lastToast = () => useToasts.getState().toasts.at(-1)

beforeEach(() => {
  resetToasts()
  usePlanCelebration.setState({ celebrating: null })
  useRoutine.setState({
    routineEntries: [],
    readingPlans: [RUN],
    deletedRoutineRecords: [],
  })
})

describe('reading plan buttons', () => {
  it('Mark as read offers Undo, which unchecks the day', () => {
    markPortionRead(TODAY)
    expect(entry()?.portions).toEqual([0])
    const toast = lastToast()
    expect(toast?.intent).toBe('undo')
    expect(toast?.title).toBe('routine.home.checked')

    toast?.action?.onPress()
    expect(entry()).toBeUndefined()
    expect(planProgress(plan(), []).next?.index).toBe(0)
  })

  it('Read next portion always toasts, and Undo drops only that portion', () => {
    markPortionRead(TODAY)
    markPortionRead(TODAY)
    expect(entry()?.portions).toEqual([0, 1])
    expect(useToasts.getState().toasts).toHaveLength(1)

    lastToast()?.action?.onPress()
    expect(entry()?.portions).toEqual([0])
  })

  it('Undo on the last portion reopens the finished plan', () => {
    const total = planPortionCount(RUN)
    for (let i = 0; i < total; i++) markPortionRead(TODAY)
    expect(plan().finishedOn).toBe(TODAY)
    expect(usePlanCelebration.getState().celebrating).not.toBeNull()

    lastToast()?.action?.onPress()
    expect(plan().finishedOn).toBeUndefined()
    expect(usePlanCelebration.getState().celebrating).toBeNull()
    expect(entry()?.portions).toHaveLength(total - 1)
  })

  it('tapping a habit row still shows the plain checked toast', () => {
    toggleHabit({
      habit: 'personalStudy',
      day: TODAY,
      today: TODAY,
      done: false,
    })
    expect(lastToast()?.intent).toBe('success')
  })
})

describe('reading ahead', () => {
  it('marks the portion that was tapped, not only the next one', () => {
    markPortionRead(TODAY, 2)
    expect(entry()?.portions).toEqual([2])
    expect(
      planProgress(plan(), useRoutine.getState().routineEntries).next
    ).toMatchObject({ index: 0 })

    lastToast()?.action?.onPress()
    expect(entry()).toBeUndefined()
  })

  it('unmarks one of today’s portions and keeps the rest', () => {
    markPortionRead(TODAY)
    markPortionRead(TODAY)
    unmarkPortionRead(TODAY, 0)
    expect(entry()?.portions).toEqual([1])
    unmarkPortionRead(TODAY, 1)
    expect(entry()).toBeUndefined()
  })
})

describe('plan dates', () => {
  it('unmarks a portion read on an earlier day', () => {
    useRoutine.getState().check('bibleReading', '2026-11-03', {
      run: RUN.id,
      portion: 0,
    })
    unmarkPortionRead('2026-11-03', 0)
    expect(useRoutine.getState().routineEntries).toEqual([])
  })

  it('sets, moves and removes the finish date and moves the start', () => {
    const { setPlanDates } = useRoutine.getState()
    expect(setPlanDates(RUN.id, { finishBy: '2026-12-31' })).toBe(true)
    expect(plan().finishBy).toBe('2026-12-31')
    expect(setPlanDates(RUN.id, { finishBy: '2026-12-31' })).toBe(false)
    expect(setPlanDates(RUN.id, { startedOn: '2026-10-01' })).toBe(true)
    expect(plan()).toMatchObject({
      startedOn: '2026-10-01',
      finishBy: '2026-12-31',
    })
    expect(setPlanDates(RUN.id, { finishBy: 'soon' })).toBe(false)
    expect(setPlanDates(RUN.id, { finishBy: null })).toBe(true)
    expect('finishBy' in plan()).toBe(false)
    expect(plan().updatedAt).toBeGreaterThan(RUN.updatedAt)
  })
})
