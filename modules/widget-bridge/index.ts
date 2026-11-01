import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

type WidgetBridgeNative = {
  writeSnapshot(json: string): void

  writeFile?(name: string, base64: string): Promise<void>
  pruneFiles?(keep: string[]): Promise<void>
  reloadAllTimelines(): void
  getAppGroupIdentifier(): string | null
}

const native = requireOptionalNativeModule<WidgetBridgeNative>('WidgetBridge')

export function writeSnapshot(json: string): void {
  if (Platform.OS !== 'ios' || !native) return
  native.writeSnapshot(json)
}

export async function writeFile(name: string, base64: string): Promise<void> {
  if (Platform.OS !== 'ios' || !native?.writeFile) return
  await native.writeFile(name, base64)
}

export async function pruneFiles(keep: string[]): Promise<void> {
  if (Platform.OS !== 'ios' || !native?.pruneFiles) return
  await native.pruneFiles(keep)
}

export function reloadAllTimelines(): void {
  if (Platform.OS !== 'ios' || !native) return
  native.reloadAllTimelines()
}

export function getAppGroupIdentifier(): string | null {
  if (Platform.OS !== 'ios' || !native) return null
  return native.getAppGroupIdentifier()
}

export function isAvailable(): boolean {
  return Platform.OS === 'ios' && native != null
}
