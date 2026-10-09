import { mmkvStorage } from '@/stores/mmkv'
import { usePreferences } from '@/stores/preferences'
import { setDevFlagOverride } from '@/lib/featureFlags'
import { registerForPushNotificationsAsync } from '@/lib/notifications'
import { reportPerf } from '@/lib/perfProbe'
import { navigationRef } from '@/features/contacts/lib/linking'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { quickConnectCalendar } from '@/app/calendar/calendarSync'
import { seedScenario } from '@/app/dev-harness/seedScenario'

/** 160 contacts, so work that grows with the data shows up. */
const SCENARIO = 'busy'
/** Survives relaunches, so only the first launch after install seeds. */
const SETUP_KEY = 'perfSetupScenario'

async function outcome(step: () => Promise<unknown>): Promise<string> {
  try {
    const result = await step()
    return typeof result === 'string' ? result : 'ok'
  } catch (error) {
    return `error: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function setUp() {
  seedScenario(SCENARIO)
  // Reminders reconcile only with permission and something to schedule; the
  // scenario's follow-ups don't notify, so also remind about unlogged days.
  usePreferences.getState().set({
    unloggedDayReminders: true,
    unloggedDayRemindersEnabledAt: Date.now(),
  })
  const notifications = await outcome(async () =>
    (await registerForPushNotificationsAsync()).granted ? 'granted' : 'denied'
  )
  // Needs CloudKit on iOS, so a simulator without an Apple Account reports the
  // error; Android creates a local calendar.
  const calendar = await outcome(quickConnectCalendar)
  const buddies = await outcome(() => buddiesEngine.ensureInbox())
  mmkvStorage.set(SETUP_KEY, SCENARIO)
  reportPerf({
    type: 'setup',
    at: Date.now(),
    scenario: SCENARIO,
    notifications,
    calendar,
    buddies,
  })
}

/**
 * Profiling builds only (`EXPO_PUBLIC_PERF_PROBE=1`; see docs/perf). Release
 * bundles have no `__WW_DEV__` to seed through, so the first launch after
 * install seeds here and turns on the paths the probe's counters cover
 * (reminders, Calendar Sync, Buddies). Every launch forces the Buddies flag
 * on.
 */
export function installPerfSetup() {
  setDevFlagOverride('buddies', true)
  if (mmkvStorage.getString(SETUP_KEY)) return
  const start = () => {
    if (navigationRef.isReady()) void setUp()
    else setTimeout(start, 250)
  }
  start()
}
