import { create } from 'zustand'
import type { ReadingPlanKind } from '@/types/routine'

export type PlanCelebration = {
  kind: ReadingPlanKind
  days: number
  coins: number | null
}

type State = { celebrating: PlanCelebration | null }

export const usePlanCelebration = create<State>(() => ({ celebrating: null }))

export const celebratePlan = (celebration: PlanCelebration) =>
  usePlanCelebration.setState({ celebrating: celebration })

export const endPlanCelebration = () =>
  usePlanCelebration.setState({ celebrating: null })
