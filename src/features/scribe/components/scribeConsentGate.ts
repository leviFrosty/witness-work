import type {
  RootStackNavigation,
  ScribeConsentRouteParams,
} from '@/types/rootStack'
import { scribeTermsPending } from '@/features/scribe/stores/consent'

type Navigate = Pick<RootStackNavigation, 'navigate'>

let waiting: ((accepted: boolean) => void) | null = null

export function askScribeConsent(
  navigation: Navigate,
  params: ScribeConsentRouteParams = { surface: 'first_open' }
): Promise<boolean> {
  if (!scribeTermsPending()) return Promise.resolve(true)
  settleScribeConsent(false)
  return new Promise((resolve) => {
    waiting = resolve
    navigation.navigate('ScribeConsent', params)
  })
}

export function settleScribeConsent(accepted: boolean): void {
  const resolve = waiting
  waiting = null
  resolve?.(accepted)
}
