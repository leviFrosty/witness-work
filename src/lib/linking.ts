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
 * | URL                                 | Screen                                     |
 * | ----------------------------------- | ------------------------------------------ |
 * | `witnesswork://add-time`            | Add Time                                   |
 * | `witnesswork://contact/:id`         | Contact Details                            |
 * | `witnesswork://contact/:id/:convId` | Contact Details with highlighted conv.     |
 * | `witnesswork://shared-good-news`    | Home + triggers checkbox confetti (action) |
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
