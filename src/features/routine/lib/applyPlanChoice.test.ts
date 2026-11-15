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
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/stores/preferences', async () => {
  const { create } = await import('zustand')
  type State = {
    readingPlanRunId: string | null
    set: (next: Partial<State>) => void
  }
  return {
    usePreferences: create<State>((set) => ({
      readingPlanRunId: null,
      set: (next) => set(next),
    })),
  }
})

import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'
import useRoutine from '@/stores/routine'
import { applyPlanChoice } from '@/features/routine/lib/applyPlanChoice'

const TODAY = '2026-11-07'
const LATER = '2026-11-12'

const capture = vi.mocked(analytics.capture)
const runs = () => useRoutine.getState().readingPlans
const runId = () => usePreferences.getState().readingPlanRunId

beforeEach(() => {
  useRoutine.setState({
    routineEntries: [],
    readingPlans: [],
    deletedRoutineRecords: [],
  })
  usePreferences.setState({ readingPlanRunId: null })
  capture.mockClear()
})

describe('applyPlanChoice', () => {
  it('starts a run for a first plan', () => {
    applyPlanChoice({ kind: 'canonical' }, TODAY)
    expect(runs()).toHaveLength(1)
    expect(runs()[0]).toMatchObject({ kind: 'canonical', startedOn: TODAY })
    expect(runId()).toBe(runs()[0].id)
    expect(capture).toHaveBeenCalledWith(
      'routine_plan_started',
      expect.objectContaining({ kind: 'canonical', resumed: false })
    )
  })

  it('changes an unread plan in place, so trying amounts leaves one run', () => {
    applyPlanChoice({ kind: 'canonical' }, TODAY)
    const id = runId()
    applyPlanChoice(
      { kind: 'canonical', amount: { unit: 'verses', count: 5 } },
      LATER
    )
    applyPlanChoice(
      { kind: 'canonical', amount: { unit: 'chapters', count: 2 } },
      LATER
    )
    expect(runs()).toHaveLength(1)
    expect(runId()).toBe(id)
    expect(runs()[0]).toMatchObject({
      id,
      kind: 'canonical',
      chaptersPerDay: 2,
      startedOn: LATER,
    })
    expect(runs()[0].versesPerDay).toBeUndefined()
    expect(capture).toHaveBeenLastCalledWith(
      'routine_plan_changed',
      expect.objectContaining({ kind: 'canonical', chapters_per_day: 2 })
    )
  })

  it('counts a change to another kind of plan as a start', () => {
    applyPlanChoice({ kind: 'canonical' }, TODAY)
    applyPlanChoice(
      {
        kind: 'custom',
        startBook: 18,
        endBook: 19,
        amount: { unit: 'chapters', count: 1 },
      },
      TODAY
    )
    expect(runs()).toHaveLength(1)
    expect(runs()[0]).toMatchObject({
      kind: 'custom',
      startBook: 18,
      endBook: 19,
      chaptersPerDay: 1,
    })
    expect(capture).toHaveBeenLastCalledWith(
      'routine_plan_started',
      expect.objectContaining({ kind: 'custom', books: 2, resumed: false })
    )
  })

  it('keeps a plan that has readings and starts another', () => {
    applyPlanChoice({ kind: 'canonical' }, TODAY)
    const first = runId()!
    useRoutine.getState().check('bibleReading', TODAY, {
      run: first,
      portion: 0,
    })
    applyPlanChoice({ kind: 'chronological' }, LATER)
    expect(runs()).toHaveLength(2)
    expect(runs()[0]).toMatchObject({ id: first, kind: 'canonical' })
    expect(runId()).toBe(runs()[1].id)
  })

  it('goes back to a plan left earlier, and leaves the unread one alone', () => {
    applyPlanChoice({ kind: 'canonical' }, TODAY)
    const first = runId()!
    useRoutine.getState().check('bibleReading', TODAY, {
      run: first,
      portion: 0,
    })
    applyPlanChoice({ kind: 'chronological' }, LATER)
    applyPlanChoice({ kind: 'canonical' }, LATER)
    expect(runs()).toHaveLength(2)
    expect(runId()).toBe(first)
    expect(runs()[1].kind).toBe('chronological')
    expect(capture).toHaveBeenLastCalledWith(
      'routine_plan_started',
      expect.objectContaining({ kind: 'canonical', resumed: true })
    )
  })

  it('goes back to Daily without touching the plan', () => {
    applyPlanChoice({ kind: 'canonical' }, TODAY)
    capture.mockClear()
    applyPlanChoice({ kind: 'today' }, TODAY)
    expect(runId()).toBeNull()
    expect(runs()).toHaveLength(1)
    expect(capture).not.toHaveBeenCalled()
  })

  it('reads a finished plan again as a new run', () => {
    applyPlanChoice({ kind: 'canonical' }, TODAY)
    const first = runId()!
    useRoutine.getState().finishPlan(first, TODAY)
    applyPlanChoice({ kind: 'canonical' }, LATER, { restart: true })
    expect(runs()).toHaveLength(2)
    expect(runId()).toBe(runs()[1].id)
    expect(runs()[0].finishedOn).toBe(TODAY)
  })
})
