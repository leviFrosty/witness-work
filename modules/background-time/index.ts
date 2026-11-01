import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

interface BackgroundTimeNative {
  backgroundTimeVersion?: number

  begin(name: string): number
  end(id: number): void
}

const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<BackgroundTimeNative>('BackgroundTime')
    : null

export const isAvailable = (): boolean =>
  native !== null && (native.backgroundTimeVersion ?? 0) >= 1

export async function withBackgroundTime<T>(
  name: string,
  run: () => Promise<T>
): Promise<T> {
  let id = 0
  if (isAvailable()) {
    try {
      id = native!.begin(name)
    } catch {
      id = 0
    }
  }
  try {
    return await run()
  } finally {
    if (id !== 0) {
      try {
        native!.end(id)
      } catch {}
    }
  }
}
