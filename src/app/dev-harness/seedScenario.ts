import moment from 'moment'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { navigationRef } from '@/features/contacts/lib/linking'
import { buildScenario } from '@/app/dev-harness/scenarios'
import { resetLocalData } from '@/app/dev-harness/resetLocalData'
import { runBadgeEvaluation } from '@/app/badges/runBadgeEvaluation'
import { forgetRolloverPrompts } from '@/features/service-reports/hooks/useRolloverPrompt'

let rootReset: ReturnType<typeof setTimeout> | undefined

export function cancelSeedRootReset() {
  clearTimeout(rootReset)
  rootReset = undefined
}

export function seedScenario(name: string) {
  const scenario = buildScenario(name, moment())
  resetLocalData()

  forgetRolloverPrompts()
  const preferences = usePreferences.getState()
  preferences.setRole(scenario.role)
  usePreferences.getState().set({
    onboardingComplete: scenario.onboarded,
    roleHistory: scenario.roleHistory,
    tenureStartDate: scenario.tenureStartDate,

    lastRolloverYearMonth: moment().format('YYYY-MM'),

    scheduleIntroSeen: scenario.onboarded,
    submittedReportMonths: scenario.submittedReportMonths,
  })
  if (scenario.onboarded) {
    useProfile.getState().set({
      name: scenario.profileName,
      hasCompletedProfileSetup: true,
    })
  }

  useContacts.getState().addContacts(scenario.contacts)
  useConversations.getState().addConversations(scenario.visits)
  const { addServiceReports, addDayPlan, addRecurringPlan } =
    useServiceReport.getState()
  addServiceReports(scenario.timeEntries)
  scenario.dayPlans.forEach((plan) => addDayPlan(plan))
  scenario.recurringPlans.forEach((plan) => addRecurringPlan(plan))
  if (scenario.onboarded) {
    runBadgeEvaluation({ quiet: true })
    usePreferences.getState().markBadgesSeen()

    clearTimeout(rootReset)
    rootReset = setTimeout(() => {
      rootReset = undefined
      if (navigationRef.isReady())
        navigationRef.resetRoot({ index: 0, routes: [{ name: 'Root' }] })
    }, 100)
  }
}
