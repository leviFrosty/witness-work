import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

type WidgetBridgeNative = {
  writeSnapshot(json: string): void
  reloadAllTimelines(): void
  getAppGroupIdentifier(): string | null
}

const native = requireOptionalNativeModule<WidgetBridgeNative>('WidgetBridge')

/**
 * Writes a JSON-encoded widget snapshot to the App Group container shared with
 * the iOS widget extension. No-op on platforms other than iOS, or if the native
 * module isn't linked yet (e.g. before prebuild).
 */
export function writeSnapshot(json: string): void {
  if (Platform.OS !== 'ios' || !native) return
  native.writeSnapshot(json)
}

/**
 * Asks WidgetKit to reload all timelines so the widget re-reads the snapshot.
 * No-op outside iOS or before prebuild.
 */
export function reloadAllTimelines(): void {
  if (Platform.OS !== 'ios' || !native) return
  native.reloadAllTimelines()
}

/** Debug helper. Returns the App Group identifier the native module resolved. */
export function getAppGroupIdentifier(): string | null {
  if (Platform.OS !== 'ios' || !native) return null
  return native.getAppGroupIdentifier()
}

/** Whether the native module is available in the current binary. */
export function isAvailable(): boolean {
  return Platform.OS === 'ios' && native != null
}
