import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

interface FontWeightAdjustmentNative {
  get(): number
}

const native = requireOptionalNativeModule<FontWeightAdjustmentNative>(
  'FontWeightAdjustment'
)

export function getFontWeightAdjustment(): number {
  if (Platform.OS !== 'android' || !native) return 0
  try {
    return native.get()
  } catch {
    return 0
  }
}
