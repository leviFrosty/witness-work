import { create } from 'zustand'
import { combine, createJSONStorage } from 'zustand/middleware'
import { isDayKey } from '@/lib/dayKeys'
import { routineEntryId } from '@/lib/routine/habits'
import { clampChaptersPerDay } from '@/lib/routine/readingPlans'
import { syncTimestamp } from '@/lib/syncClock'
import { stampPastTombstone } from '@/lib/syncTombstones'
import { PersistStorage } from '@/stores/mmkv'
import { persist } from '@/stores/persist'
import {
  isWeeklyHabit,
  type ReadingPlanKind,
  type ReadingPlanRun,
  type RoutineEntry,
  type RoutineHabit,
  type RoutineTombstone,
} from '@/types/routine'

const initialState = {
  routineEntries: [] as RoutineEntry[],

  readingPlans: [] as ReadingPlanRun[],

  deletedRoutineRecords: [] as RoutineTombstone[],
}

type State = typeof initialState

const stampFor = (state: State, id: string, previous?: number): number =>
  stampPastTombstone(state.deletedRoutineRecords, id, previous)

const newRunId = (): string =>
  `plan-${Date.now().toString(36)}-${Math.floor(Math.random() * 0x100000000)
    .toString(36)
    .padStart(7, '0')}`

const tombstone = (record: { id: string; updatedAt: number }) => ({
  id: record.id,
  deletedAt: syncTimestamp(record.updatedAt),
})

const withoutEntry = (state: State, existing: RoutineEntry) => ({
  routineEntries: state.routineEntries.filter(
    (entry) => entry.id !== existing.id
  ),
  deletedRoutineRecords: [
    ...state.deletedRoutineRecords.filter((t) => t.id !== existing.id),
    tombstone(existing),
  ],
})

export type CheckOptions = {
  run?: string

  portion?: number
}

export const useRoutine = create(
  persist(
    combine(initialState, (set, get) => ({
      set,

      check: (
        habit: RoutineHabit,
        day: string,
        options: CheckOptions = {}
      ): boolean => {
        if (!isDayKey(day)) return false
        const id = routineEntryId(habit, day)
        const existing = get().routineEntries.find((entry) => entry.id === id)
        const { run, portion } = options
        const addsPortion =
          habit === 'bibleReading' &&
          run !== undefined &&
          portion !== undefined &&
          Number.isInteger(portion) &&
          portion >= 0
        if (existing && existing.on === day) {
          if (!addsPortion) return false
          if (existing.run === run && existing.portions?.includes(portion!))
            return false
        }
        set((state) => {
          const kept =
            existing && existing.on === day && existing.run === run
              ? (existing.portions ?? [])
              : []
          const entry: RoutineEntry = {
            id,
            habit,
            on: day,
            ...(addsPortion
              ? {
                  run,
                  portions: [...new Set([...kept, portion!])].sort(
                    (a, b) => a - b
                  ),
                }
              : {}),
            updatedAt: stampFor(state, id, existing?.updatedAt),
          }
          return {
            routineEntries: [
              ...state.routineEntries.filter((other) => other.id !== id),
              entry,
            ],
          }
        })
        return true
      },

      uncheck: (habit: RoutineHabit, day: string): boolean => {
        const id = routineEntryId(habit, day)
        const existing = get().routineEntries.find((entry) => entry.id === id)
        if (!existing) return false
        if (!isWeeklyHabit(habit) && existing.on !== day) return false
        set((state) => withoutEntry(state, existing))
        return true
      },

      uncheckPortion: (day: string, run: string, portion: number): boolean => {
        const id = routineEntryId('bibleReading', day)
        const existing = get().routineEntries.find((entry) => entry.id === id)
        if (
          !existing ||
          existing.on !== day ||
          existing.run !== run ||
          !existing.portions?.includes(portion)
        )
          return false
        const portions = existing.portions.filter((p) => p !== portion)
        if (portions.length === 0) {
          set((state) => withoutEntry(state, existing))
          return true
        }
        set((state) => ({
          routineEntries: state.routineEntries.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  portions,
                  updatedAt: stampFor(state, id, entry.updatedAt),
                }
              : entry
          ),
        }))
        return true
      },

      startPlan: (args: {
        kind: ReadingPlanKind
        startBook?: number
        chaptersPerDay?: number
        today: string
      }): string | null => {
        if (!isDayKey(args.today)) return null
        const id = newRunId()
        set((state) => ({
          readingPlans: [
            ...state.readingPlans,
            {
              id,
              kind: args.kind,
              ...(args.kind === 'custom'
                ? {
                    startBook: args.startBook ?? 0,
                    chaptersPerDay: clampChaptersPerDay(args.chaptersPerDay),
                  }
                : {}),
              startedOn: args.today,
              updatedAt: stampFor(state, id),
            },
          ],
        }))
        return id
      },

      finishPlan: (id: string, day: string): boolean => {
        const run = get().readingPlans.find((plan) => plan.id === id)
        if (!run || run.finishedOn || !isDayKey(day)) return false
        set((state) => ({
          readingPlans: state.readingPlans.map((plan) =>
            plan.id === id
              ? {
                  ...plan,
                  finishedOn: day,
                  updatedAt: stampFor(state, id, plan.updatedAt),
                }
              : plan
          ),
        }))
        return true
      },

      reopenPlan: (id: string): boolean => {
        const run = get().readingPlans.find((plan) => plan.id === id)
        if (!run?.finishedOn) return false
        set((state) => ({
          readingPlans: state.readingPlans.map((plan) => {
            if (plan.id !== id) return plan
            const { finishedOn: _finishedOn, ...open } = plan
            return { ...open, updatedAt: stampFor(state, id, plan.updatedAt) }
          }),
        }))
        return true
      },

      _WARNING_forceDeleteRoutine: () => set(initialState),
    })),
    {
      name: 'routine',
      storage: createJSONStorage(() => PersistStorage),
      version: 1,
      migrate: (persistedState) => persistedState as State,
    }
  )
)

export default useRoutine
