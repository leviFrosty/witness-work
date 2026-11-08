import { streakHistoryFor } from '@/lib/currentServiceStreak'
import useConversations from '@/stores/conversationStore'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import useRoutine from '@/stores/routine'
import { routineEarned } from '@/lib/routine/coins'
import {
  petDaysOut,
  petEarned,
  coinsOf,
  spentOn,
  walletOf,
  type Earned,
} from '@/features/pet/lib/currency'
import { localDayKey } from '@/features/pet/lib/dayKeys'
import { figGrowth } from '@/features/pet/lib/hatLife'
import { selectHeartsPace } from '@/features/pet/lib/petInputs'
import { readPet } from '@/features/pet/lib/records'
import { storedPurchases } from '@/features/pet/lib/unlocks'

export type PetEarnings = { earned: Earned; wallet: number }

export function petEarningsNow(now: Date = new Date()): PetEarnings | null {
  const stored = usePet.getState().pet
  if (!stored) return null
  const pet = readPet(stored)
  const { serviceReports, dayPlans, recurringPlans } =
    useServiceReport.getState()
  const visits = useConversations.getState().conversations
  const prefs = usePreferences.getState()
  const today = localDayKey(now)
  const paceOf = selectHeartsPace(prefs.roleHistory, prefs.role)
  const earned = petEarned({
    daysOut: petDaysOut({ serviceReports, visits }),
    history: streakHistoryFor(
      prefs,
      { serviceReports, dayPlans, recurringPlans },
      now
    ),
    streaks: prefs.showStreaks,
    adoptedOn: pet.adoptedOn,
    today,
    paceOf,
    routine: routineEarned({
      entries: useRoutine.getState().routineEntries,
      plans: useRoutine.getState().readingPlans,
      adoptedOn: pet.adoptedOn,
      today,
    }),
  })
  return {
    earned,
    wallet: walletOf(coinsOf(earned), spentOn(storedPurchases(stored))),
  }
}

export function hatGrowthNow(): number | undefined {
  const { pet } = usePet.getState()
  if (!pet) return undefined
  const { serviceReports } = useServiceReport.getState()
  const visits = useConversations.getState().conversations
  return figGrowth(
    storedPurchases(pet),
    petDaysOut({ serviceReports, visits }).days
  )
}
