import * as ExpoHaptics from 'expo-haptics'

const Haptics = {
  light: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light),
  medium: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium),
  heavy: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy),
  /**
   * Lightweight tick — designed for scrub/picker UX. Cheaper than `light` and
   * tuned by iOS to be flooded at high frequency without overwhelming the
   * haptic engine.
   */
  selection: () => ExpoHaptics.selectionAsync(),
  success: () =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success),
  error: () =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error),
}

export default Haptics
