import * as ExpoHaptics from 'expo-haptics'

const Haptics = {
  light: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light),
  medium: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium),
  heavy: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy),
  success: () =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success),
  error: () =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error),
}

export default Haptics
