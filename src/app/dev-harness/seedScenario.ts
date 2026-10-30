import moment from 'moment'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { navigationRef } from '@/features/contacts/lib/linking'
import { buildScenario } from '@/app/dev-harness/scenarios'
import { resetLocalData } from '@/app/dev-harness/resetLocalData'
import { rebasePublishedPhotos } from '@/app/sync/photoBaseline'
import { runBadgeEvaluation } from '@/app/badges/runBadgeEvaluation'
import { forgetRolloverPrompts } from '@/features/service-reports/hooks/useRolloverPrompt'

/** The seed's move to Home, pending until RootStack has swapped stacks. */
let rootReset: ReturnType<typeof setTimeout> | undefined

/**
 * Drops a pending move to Home, for a caller that remounts every screen anyway:
 * landing later, it would undo a screen opened after the remount.
 */
export function cancelSeedRootReset() {
  clearTimeout(rootReset)
  rootReset = undefined
}

/**
 * Replaces this device's data with a scenario (`scenarios.ts`). Used by the dev
 * harness (`__WW_DEV__.seed`) and by profiling builds (`perfSetup.ts`).
 */
export function seedScenario(name: string) {
  const scenario = buildScenario(name, moment())
  resetLocalData()
  // Progress offers a rollover once per launch; a seed starts over like one.
  forgetRolloverPrompts()
  const preferences = usePreferences.getState()
  preferences.setRole(scenario.role)
  usePreferences.getState().set({
    onboardingComplete: scenario.onboarded,
    roleHistory: scenario.roleHistory,
    tenureStartDate: scenario.tenureStartDate,
    // Keeps the full-screen rollover prompt from covering a fresh seed.
    lastRolloverYearMonth: moment().format('YYYY-MM'),
    // Same for the Schedule intro.
    scheduleIntroSeen: scenario.onboarded,
    submittedReportMonths: scenario.submittedReportMonths,
  })
  if (scenario.onboarded) {
    useProfile.getState().set({
      name: scenario.profileName,
      hasCompletedProfileSetup: true,
    })
  }
  // One write per store, so the `stress` scenario seeds in seconds.
  useContacts.getState().addContacts(scenario.contacts)
  useConversations.getState().addConversations(scenario.visits)
  const { addServiceReports, addDayPlan, addRecurringPlan } =
    useServiceReport.getState()
  addServiceReports(scenario.timeEntries)
  scenario.dayPlans.forEach((plan) => addDayPlan(plan))
  scenario.recurringPlans.forEach((plan) => addRecurringPlan(plan))
  rebasePublishedPhotos()
  if (scenario.onboarded) {
    // File every badge the seeded records reach as history now, so a seed
    // never sets off celebrations or the history summary, and mark them seen
    // so only badges earned afterwards read as new. A fresh install keeps its
    // first pass for after onboarding, like a real one.
    runBadgeEvaluation({ quiet: true })
    usePreferences.getState().markBadgesSeen()
    // Start from Home, after RootStack swaps Onboarding out for Root.
    clearTimeout(rootReset)
    rootReset = setTimeout(() => {
      rootReset = undefined
      if (navigationRef.isReady())
        navigationRef.resetRoot({ index: 0, routes: [{ name: 'Root' }] })
    }, 100)
  }
}
