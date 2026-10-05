import * as ExpoHaptics from 'expo-haptics'
import { usePreferences } from '@/stores/preferences'

/**
 * Whether haptic feedback may play on this device. Read at call time rather
 * than subscribed to, so toggling the setting applies to the next tap without
 * re-rendering every caller.
 */
export const isHapticsEnabled = () => usePreferences.getState().hapticsEnabled

/**
 * Skips `play` when the User turned haptics off. `expo-haptics` is only
 * imported here (lint-enforced) so the Audio & Haptics setting can't be
 * bypassed.
 */
const whenEnabled = (play: () => Promise<void>) => () =>
  isHapticsEnabled() ? play() : Promise.resolve()

const Haptics = {
  light: whenEnabled(() =>
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light)
  ),
  medium: whenEnabled(() =>
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium)
  ),
  heavy: whenEnabled(() =>
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy)
  ),
  /**
   * Lightweight tick — designed for scrub/picker UX. Cheaper than `light` and
   * tuned by iOS to be flooded at high frequency without overwhelming the
   * haptic engine.
   */
  selection: whenEnabled(() => ExpoHaptics.selectionAsync()),
  success: whenEnabled(() =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success)
  ),
  error: whenEnabled(() =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error)
  ),
  /** Android's system long-press feedback, for menus opened by long press. */
  androidLongPress: whenEnabled(() =>
    ExpoHaptics.performAndroidHapticsAsync(
      ExpoHaptics.AndroidHaptics.Long_Press
    )
  ),
}

export default Haptics
