import { mmkvStorage } from '@/stores/mmkv'
import { usePreferences } from '@/stores/preferences'
import { setDevFlagOverride } from '@/lib/featureFlags'
import { registerForPushNotificationsAsync } from '@/lib/notifications'
import { reportPerf } from '@/lib/perfProbe'
import { navigationRef } from '@/features/contacts/lib/linking'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { quickConnectCalendar } from '@/app/calendar/calendarSync'
import { seedScenario } from '@/app/dev-harness/seedScenario'

const SCENARIO = 'busy'

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

  usePreferences.getState().set({
    unloggedDayReminders: true,
    unloggedDayRemindersEnabledAt: Date.now(),
  })
  const notifications = await outcome(async () =>
    (await registerForPushNotificationsAsync()).granted ? 'granted' : 'denied'
  )

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

export function installPerfSetup() {
  setDevFlagOverride('buddies', true)
  if (mmkvStorage.getString(SETUP_KEY)) return
  const start = () => {
    if (navigationRef.isReady()) void setUp()
    else setTimeout(start, 250)
  }
  start()
}
