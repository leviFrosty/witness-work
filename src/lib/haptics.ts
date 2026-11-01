import * as ExpoHaptics from 'expo-haptics'
import { usePreferences } from '@/stores/preferences'

export const isHapticsEnabled = () => usePreferences.getState().hapticsEnabled

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

  soft: whenEnabled(() =>
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Soft)
  ),

  rigid: whenEnabled(() =>
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Rigid)
  ),

  selection: whenEnabled(() => ExpoHaptics.selectionAsync()),
  success: whenEnabled(() =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success)
  ),
  error: whenEnabled(() =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error)
  ),

  androidLongPress: whenEnabled(() =>
    ExpoHaptics.performAndroidHapticsAsync(
      ExpoHaptics.AndroidHaptics.Long_Press
    )
  ),
}

export default Haptics
