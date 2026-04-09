import {
  LinkingOptions,
  createNavigationContainerRef,
} from '@react-navigation/native'
import * as Linking from 'expo-linking'
import { RootStackParamList } from '../types/rootStack'

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
 * | `witnesswork://contact/:id`                   | Contact Details                            |
 * | `witnesswork://contact/:id/:convId`           | Contact Details with highlighted conv.     |
 * | `witnesswork://reschedule/:contactId/:convId` | Reschedule Conversation modal              |
 * | `witnesswork://shared-good-news`              | Home + triggers checkbox confetti (action) |
 * | `witnesswork://day/:date`                     | Plan Day (view/edit plan + notes for date) |
 * | `witnesswork://day`                           | Plan Day (empty form — widget "+" button)  |
 *
 * `shared-good-news` is an **action**, not a screen. It is handled by a
 * `Linking.addEventListener('url', …)` subscriber in the root component — not
 * by this navigation config — because it needs to mutate store state (adding a
 * 0h0m service report) rather than push a new screen.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'witnesswork://'],
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
        },
      },
      'Add Time': 'add-time',
      'Contact Details': 'contact/:id/:highlightedConversationId?',
      RescheduleConversation: 'reschedule/:contactId/:conversationId',
      // Widget deep links. PlanDay is reused for both the per-date view and
      // the empty-form "create plan" CTA — the screen renders details/notes
      // for an existing plan when `date` resolves to one and an empty form
      // otherwise, so both URLs converge on the same screen.
      PlanDay: 'day/:date?',
    },
  },
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
