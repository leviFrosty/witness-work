import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

interface BackgroundTimeNative {
  backgroundTimeVersion?: number
  /** A task id, or 0 when iOS gives no time. */
  begin(name: string): number
  end(id: number): void
}

const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<BackgroundTimeNative>('BackgroundTime')
    : null

/** Whether this binary has the module (OTA updates can run on older ones). */
export const isAvailable = (): boolean =>
  native !== null && (native.backgroundTimeVersion ?? 0) >= 1

/**
 * Runs `run`, keeping the app running while it does when it's in the background
 * (an iOS background task, ended when `run` settles or when iOS's time runs
 * out). For short work that mustn't stop halfway, such as a request whose
 * answer has to be saved. Elsewhere (Android, or a binary without the module)
 * it just runs `run`. Never fails for its own reasons.
 */
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
      } catch {
        // Ended already, when iOS's time ran out.
      }
    }
  }
}
