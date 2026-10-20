import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

type WidgetBridgeNative = {
  writeSnapshot(json: string): void
  /** Missing from binaries built before the Pet widget. */
  writeFile?(name: string, base64: string): Promise<void>
  pruneFiles?(keep: string[]): Promise<void>
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
 * Writes a base64-encoded file to `pet/<name>` in the App Group container,
 * atomically, for the Pet widget's images. `name` must match
 * `^[a-z0-9-]+\.png$`; the promise rejects otherwise. Resolves without writing
 * outside iOS, before prebuild, or in a binary older than the Pet widget.
 */
export async function writeFile(name: string, base64: string): Promise<void> {
  if (Platform.OS !== 'ios' || !native?.writeFile) return
  await native.writeFile(name, base64)
}

/**
 * Deletes every file in the App Group's `pet/` folder that isn't in `keep`.
 * Resolves without deleting anything outside iOS, before prebuild, or in a
 * binary older than the Pet widget.
 */
export async function pruneFiles(keep: string[]): Promise<void> {
  if (Platform.OS !== 'ios' || !native?.pruneFiles) return
  await native.pruneFiles(keep)
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
