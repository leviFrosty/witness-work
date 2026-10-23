import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

interface FontWeightAdjustmentNative {
  get(): number
}

const native = requireOptionalNativeModule<FontWeightAdjustmentNative>(
  'FontWeightAdjustment'
)

/**
 * The weight Android's Bold text setting adds to fonts (300 while it's on), or
 * 0. Always 0 on iOS and on binaries without the module, which OTA updates can
 * run against.
 */
export function getFontWeightAdjustment(): number {
  if (Platform.OS !== 'android' || !native) return 0
  try {
    return native.get()
  } catch {
    return 0
  }
}
