import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const i18n = new I18n({ 'en-us': enUS })
  i18n.locale = 'en-us'
  i18n.missingBehavior = 'error'
  return { default: { t: (key: string, o?: object) => i18n.t(key, o) } }
})
import { itemDetail, readToday } from '@/features/routine/lib/itemDetail'
import { planProgress } from '@/lib/routine/readingPlans'
import type { RoutineSettings } from '@/lib/routine/habits'
import type { ReadingPlanRun, RoutineEntry } from '@/types/routine'

const settings: RoutineSettings = {
  habits: ['bibleReading', 'personalStudy', 'midweekPrep', 'worship'],
  meetingDays: [3, 0],
  personalStudyGoal: { kind: 'perWeek', times: 2 },
  worshipDay: null,
}
const run: ReadingPlanRun = {
  id: 'run',
  kind: 'canonical',
  startedOn: '2026-11-01',
  updatedAt: 1,
}
const read: RoutineEntry = {
  id: 'bibleReading:2026-11-05',
  habit: 'bibleReading',
  on: '2026-11-05',
  run: 'run',
  portions: [0],
  updatedAt: 1,
}
const base = {
  settings,
  today: '2026-11-05',
  studies: 1,
}

describe('routine item detail', () => {
  it('shows the next portion, then the one read today', () => {
    expect(
      itemDetail({
        ...base,
        habit: 'bibleReading',
        done: false,
        entries: [],
        plan: { run, progress: planProgress(run, []) },
      })
    ).toBe('Genesis 1–3')
    expect(readToday(run, [read], '2026-11-05')).toBe(0)
    expect(
      itemDetail({
        ...base,
        habit: 'bibleReading',
        done: true,
        entries: [read],
        plan: { run, progress: planProgress(run, [read]) },
      })
    ).toBe('Genesis 1–3')
  })

  it('counts study toward the weekly goal and names meeting days', () => {
    const at = { ...base, done: false, entries: [], plan: null }
    expect(itemDetail({ ...at, habit: 'personalStudy' })).toBe(
      '1 of 2 this week'
    )
    expect(itemDetail({ ...at, habit: 'midweekPrep' })).toBe(
      'Wednesday meeting'
    )
    expect(itemDetail({ ...at, habit: 'worship' })).toBeUndefined()
    expect(itemDetail({ ...at, habit: 'bibleReading' })).toBeUndefined()
  })
})
