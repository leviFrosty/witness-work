import {
  LinkingOptions,
  createNavigationContainerRef,
} from '@react-navigation/native'
import * as Linking from 'expo-linking'
import { usePreferences } from '@/stores/preferences'
import { afterTakeovers } from '@/stores/takeover'
import { RootStackParamList } from '@/types/rootStack'

/**
 * Shared navigation ref so non-React-Navigation code (e.g. the widget URL
 * listener) can drive navigation imperatively.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>()

/**
 * URL scheme is declared in `app.config.ts` (`scheme: 'witnesswork'`). Widget
 * targets build URLs against this scheme to deep-link into the app.
 *
 * Widget URL contract (mirrors `WidgetURLs` in Swift):
 *
 * | URL                                           | Screen                                     |
 * | --------------------------------------------- | ------------------------------------------ |
 * | `witnesswork://add-time`                      | Add Time                                   |
 * | `witnesswork://add-time/:date`                | Add Time, date pre-filled                  |
 * | `witnesswork://schedule/:date`                | Schedule, that day's sheet (calendar tap)  |
 * | `witnesswork://contact/:id`                   | Contact Details                            |
 * | `witnesswork://contact/:id/:convId`           | Contact Details with highlighted conv.     |
 * | `witnesswork://reschedule/:contactId/:convId` | Reschedule Visit modal                     |
 * | `witnesswork://shared-good-news`              | Home + triggers checkbox confetti (action) |
 * | `witnesswork://day`                           | Plan Day (empty form — widget "+" button)  |
 *
 * `shared-good-news` is an **action**, not a screen. It is handled by a
 * `Linking.addEventListener('url', …)` subscriber in the root component — not
 * by this navigation config — because it needs to mutate store state (adding a
 * 0h0m service report) rather than push a new screen.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    Linking.createURL('/'),
    'witnesswork://',
    // Universal Links for shared contact URLs. The /c/:payload path is
    // handled imperatively by ContactImportListener (it needs to decode,
    // confirm with the user, then navigate) — not via React Navigation's
    // declarative `screens` config.
    'https://ww-proxy.leviwilkerson.com',
  ],
  config: {
    // Always seed the stack with `Root` so deep-linked screens (Contact
    // Details, Add Time, …) have something to pop back to. Without this,
    // tapping back from a deep-linked screen errors with
    // "GO_BACK was not handled by any navigator".
    initialRouteName: 'Root',
    screens: {
      Root: {
        screens: {
          Home: 'home',
          // A Calendar widget day opens the same day sheet as tapping that
          // day in the app's own calendar.
          Schedule: 'schedule/:date?',
        },
      },
      // Date suffix is optional: `add-time` opens the empty form, and
      // `add-time/:date` pre-fills the date.
      'Add Time': 'add-time/:date?',
      'Contact Details': 'contact/:id/:highlightedVisitId?',
      RescheduleVisit: 'reschedule/:contactId/:visitId',
      'Visit Details': 'visit/:visitId',
      // "+" button on the Calendar widget lands here with no date to start
      // a fresh plan; the in-app schedule UI owns per-date plan editing.
      PlanDay: 'day',
    },
  },
  // A link that arrives during onboarding, or while something is taking over
  // the screen (the update reveal), opens once that's done instead of
  // underneath it (ADR 0021). The newest link wins.
  subscribe(listener) {
    let cancel = () => {}
    const deliver = (url: string) => {
      cancel()
      let stopTakeover = () => {}
      const stopOnboarding = afterOnboarding(() => {
        stopTakeover = afterTakeovers(() => listener(url))
      })
      cancel = () => {
        stopOnboarding()
        stopTakeover()
      }
    }
    const subscription = Linking.addEventListener('url', ({ url }) =>
      deliver(url)
    )
    return () => {
      cancel()
      subscription.remove()
    }
  },
}

/** Runs `run` once onboarding is done: now, or when it finishes. */
function afterOnboarding(run: () => void): () => void {
  if (usePreferences.getState().onboardingComplete) {
    run()
    return () => {}
  }
  const unsubscribe = usePreferences.subscribe((state) => {
    if (!state.onboardingComplete) return
    unsubscribe()
    run()
  })
  return unsubscribe
}

export const SHARED_GOOD_NEWS_HOST = 'shared-good-news'

/**
 * Returns true if the given incoming URL is the `shared-good-news` action.
 * Accepts both `witnesswork://shared-good-news` and the expo-linking prefixed
 * form used during development.
 */
export function isSharedGoodNewsUrl(url: string): boolean {
  try {
    const parsed = Linking.parse(url)
    return (
      parsed.hostname === SHARED_GOOD_NEWS_HOST ||
      parsed.path === SHARED_GOOD_NEWS_HOST
    )
  } catch {
    return false
  }
}
