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

/**
 * Replaces this device's data with a scenario (`scenarios.ts`). Used by the dev
 * harness (`__WW_DEV__.seed`) and by profiling builds (`perfSetup.ts`).
 */
export function seedScenario(name: string) {
  const scenario = buildScenario(name, moment())
  resetLocalData()
  const preferences = usePreferences.getState()
  preferences.setRole(scenario.role)
  usePreferences.getState().set({
    onboardingComplete: scenario.onboarded,
    tenureStartDate: scenario.tenureStartDate,
    // Keeps the full-screen rollover prompt from covering a fresh seed.
    lastRolloverYearMonth: moment().format('YYYY-MM'),
    // Same for the Schedule intro; Schedule's header button still opens it.
    scheduleIntroSeen: scenario.onboarded,
    submittedReportMonths: scenario.submittedReportMonths,
  })
  if (scenario.onboarded) {
    useProfile.getState().set({
      name: scenario.profileName,
      hasCompletedProfileSetup: true,
    })
  }
  const { addContact } = useContacts.getState()
  scenario.contacts.forEach(addContact)
  const { addConversation } = useConversations.getState()
  scenario.visits.forEach(addConversation)
  const { addServiceReport, addDayPlan, addRecurringPlan } =
    useServiceReport.getState()
  scenario.timeEntries.forEach(addServiceReport)
  scenario.dayPlans.forEach(addDayPlan)
  scenario.recurringPlans.forEach(addRecurringPlan)
  if (scenario.onboarded) {
    // File every badge the seeded records reach as history now, so a seed
    // never sets off celebrations or the history summary, and mark them seen
    // so only badges earned afterwards read as new. A fresh install keeps its
    // first pass for after onboarding, like a real one.
    runBadgeEvaluation({ quiet: true })
    usePreferences.getState().markBadgesSeen()
    // Start from Home, after RootStack swaps Onboarding out for Root.
    setTimeout(() => {
      if (navigationRef.isReady())
        navigationRef.resetRoot({ index: 0, routes: [{ name: 'Root' }] })
    }, 100)
  }
}
