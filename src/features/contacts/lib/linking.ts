import {
  LinkingOptions,
  createNavigationContainerRef,
} from '@react-navigation/native'
import * as Linking from 'expo-linking'
import { APP_LINK_HOSTS } from '@/constants/appLinks'
import { launchURL, linkSinceLaunch } from '@/lib/launchLinks'
import { webLinkingScreens } from '@/lib/webLinkingScreens'
import { usePreferences } from '@/stores/preferences'
import { afterTakeovers } from '@/stores/takeover'
import { RootStackParamList } from '@/types/rootStack'

export const navigationRef = createNavigationContainerRef<RootStackParamList>()

let openedAtLaunch: string | null = null

let heldAtLaunch: string | null = null

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    Linking.createURL('/'),
    'witnesswork://',

    ...APP_LINK_HOSTS.map((host) => `https://${host}`),
  ],
  config: {
    initialRouteName: 'Root',
    screens: {
      Root: {
        screens: {
          Home: 'home',

          Schedule: 'schedule/:date?',
        },
      },

      'Add Time': 'add-time/:date?',
      'Contact Details': 'contact/:id/:highlightedVisitId?',
      RescheduleVisit: 'reschedule/:contactId/:visitId',
      'Visit Details': 'visit/:visitId',

      PlanDay: 'day',
      ...webLinkingScreens,
    },
  },

  async getInitialURL() {
    const url = await launchURL('navigation')
    openedAtLaunch = url
    if (url && !usePreferences.getState().onboardingComplete) {
      heldAtLaunch = url
      return null
    }
    return url
  },

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

    const missed = linkSinceLaunch('navigation')
    const pending = missed && missed !== openedAtLaunch ? missed : heldAtLaunch
    heldAtLaunch = null
    if (pending) deliver(pending)
    return () => {
      cancel()
      subscription.remove()
    }
  },
}

function afterOnboarding(run: () => void): () => void {
  if (usePreferences.getState().onboardingComplete) {
    run()
    return () => {}
  }
  let stopWaiting = () => {}
  const unsubscribe = usePreferences.subscribe((state) => {
    if (!state.onboardingComplete) return
    unsubscribe()
    stopWaiting = afterAppScreens(run)
  })
  return () => {
    unsubscribe()
    stopWaiting()
  }
}

function afterAppScreens(run: () => void): () => void {
  const ready = () =>
    navigationRef.isReady() &&
    navigationRef.getRootState()?.routeNames.includes('Root') === true
  if (ready()) {
    run()
    return () => {}
  }
  const remove = navigationRef.addListener('state', () => {
    if (!ready()) return
    remove()
    run()
  })
  return remove
}

export const SHARED_GOOD_NEWS_HOST = 'shared-good-news'

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
