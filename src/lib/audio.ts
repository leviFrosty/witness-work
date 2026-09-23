import { useAudioPlayer } from 'expo-audio'
import { usePreferences } from '@/stores/preferences'
// @ts-expect-error MP3 doesn't export module
import successChime from '@/assets/audio/success-chime.mp3'

/**
 * Every sound the app can play. Callers reference sounds by name so the asset
 * behind a name can change (or become user-selectable) without touching them.
 */
const SOUNDS = {
  successChime,
}

export type SoundName = keyof typeof SOUNDS

/**
 * Whether in-app sounds may play on this device. Read at play time rather than
 * subscribed to, so toggling the setting applies to the next sound without
 * re-rendering every player.
 */
export const isAudioEnabled = () => usePreferences.getState().audioEnabled

/**
 * Preloads `name` and returns a function that plays it from the start. This and
 * `expo-audio` itself are only imported here (lint-enforced) so the Audio &
 * Haptics setting can't be bypassed.
 */
export function useSound(name: SoundName) {
  const player = useAudioPlayer(SOUNDS[name])

  return () => {
    if (!isAudioEnabled()) return
    try {
      // No setAudioModeAsync here: the default audio mode keeps the iOS
      // session in the ambient category, so sounds respect the device's
      // ring/silent switch (#365). Don't re-add `playsInSilentMode: true` —
      // it flips the session to `.playback`, which bypasses the mute switch.
      player.seekTo(0)
      player.play()
    } catch {
      // Silently fail if playback cannot start
    }
  }
}
