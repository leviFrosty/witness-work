import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import usePublisher from '@/hooks/usePublisher'
import { appDigitSystem } from '@/lib/numbers'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import type { SignData } from '@/features/pet/art'
import { buildSignData } from '@/features/pet/lib/signData'

export default function usePetSignData(today: Date): SignData {
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  const visits = useConversations((s) => s.conversations)
  const overrideCreditLimit = usePreferences((s) => s.overrideCreditLimit)
  const customCreditLimitHours = usePreferences((s) => s.customCreditLimitHours)
  const target = { month: today.getMonth(), year: today.getFullYear() }
  const { type: publisher } = usePublisher(target)
  const { effectiveGoalHours } = useMonthlyGoal(target)

  return buildSignData({
    today,
    serviceReports,
    dayPlans,
    recurringPlans,
    visits,
    publisher,
    creditLimit: {
      enabled: overrideCreditLimit,
      customLimitHours: customCreditLimitHours,
    },
    monthGoalHours: effectiveGoalHours,
    digits: appDigitSystem(),
  })
}
