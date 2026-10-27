import { useNavigation } from '@react-navigation/native'
import { analytics } from '@/lib/analytics'
import type { RootStackNavigation } from '@/types/rootStack'
import {
  useScribeAvailability,
  useScribeVoiceAvailability,
  type ScribeAvailability,
  type ScribeConversationParams,
  type ScribeEntryPoint,
  type ScribeVoiceAvailability,
  type ScribeVoiceParams,
} from '@/features/scribe'
import { scribeConsentPending } from '@/features/scribe/stores/consent'

export type ScribeEntryState =
  | 'available'
  | 'limited'
  | 'offline'
  | 'blocked'
  | 'voice_unsupported'

export type ScribeEntryTarget =
  | { route: 'ScribeOffline' }
  | { route: 'ScribeConversation'; params: ScribeConversationParams }
  | { route: 'ScribeVoice'; params: ScribeVoiceParams }

/** `scribe_entry_tapped`'s `state`, or null where entry points don't show. */
export const scribeEntryState = (
  availability: ScribeAvailability,
  voice: ScribeVoiceAvailability
): ScribeEntryState | null => {
  switch (availability.status) {
    case 'hidden':
      return null
    case 'offline':
      return 'offline'
    case 'blocked':
      return 'blocked'
    case 'available':
      if (availability.limited) return 'limited'
      return voice === 'unsupported' ? 'voice_unsupported' : 'available'
  }
}

/**
 * Where an entry point goes: offline explains, blocked and limited open the
 * conversation to explain there, no on-device speech opens it with the keyboard
 * (ADR 0032 §7), and everything else starts listening.
 */
export const scribeEntryTarget = (
  entry: ScribeEntryPoint,
  availability: ScribeAvailability,
  voice: ScribeVoiceAvailability
): ScribeEntryTarget | null => {
  switch (scribeEntryState(availability, voice)) {
    case null:
      return null
    case 'offline':
      return { route: 'ScribeOffline' }
    case 'blocked':
    case 'limited':
      return { route: 'ScribeConversation', params: { entry } }
    case 'voice_unsupported':
      return {
        route: 'ScribeConversation',
        params: { entry, focusComposer: true },
      }
    case 'available':
      return { route: 'ScribeVoice', params: { entry } }
  }
}

type Navigate = Pick<RootStackNavigation, 'navigate'>

/**
 * Goes to a Scribe AI screen, through the one-time Terms of Use and Zero Data
 * Retention steps while this device hasn't seen them. Offline only explains, so
 * it asks nothing.
 */
export const navigateToScribe = (
  navigation: Navigate,
  target: ScribeEntryTarget
) => {
  if (target.route === 'ScribeOffline')
    return navigation.navigate('ScribeOffline')
  if (scribeConsentPending())
    return navigation.navigate('ScribeConsent', { mode: 'open', next: target })
  if (target.route === 'ScribeVoice')
    navigation.navigate('ScribeVoice', target.params)
  else navigation.navigate('ScribeConversation', target.params)
}

/** Opens Scribe AI from an entry point and records the tap. */
export const openScribe = (
  navigation: Navigate,
  entry: ScribeEntryPoint,
  availability: ScribeAvailability,
  voice: ScribeVoiceAvailability
) => {
  const target = scribeEntryTarget(entry, availability, voice)
  const state = scribeEntryState(availability, voice)
  if (!target || !state) return
  analytics.capture('scribe_entry_tapped', { entry, state })
  navigateToScribe(navigation, target)
}

/** Availability for an entry point, and `open(entry)` to run it. */
export const useOpenScribe = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const availability = useScribeAvailability()
  const voice = useScribeVoiceAvailability()
  return {
    availability,
    hidden: availability.status === 'hidden',
    offline: availability.status === 'offline',
    open: (entry: ScribeEntryPoint) =>
      openScribe(navigation, entry, availability, voice),
  }
}
