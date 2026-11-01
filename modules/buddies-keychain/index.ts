import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

export type RootSeedBackup =
  | 'cloud'
  | 'device'
  | 'restored'
  | 'pending'
  | 'unavailable'

interface BuddiesKeychainNative {
  buddiesKeychainVersion?: number

  peekRootSeed(): string | null

  getOrCreateRootSeed(): string

  deleteRootSeed(): void

  peekRootSeedAsync?(): Promise<string | null>
  getOrCreateRootSeedAsync?(): Promise<string>
  deleteRootSeedAsync?(): Promise<void>

  replaceRootSeedAsync?(seed: string): Promise<void>

  rootSeedBackup?(): RootSeedBackup

  setAlertContext?(json: string | null): void

  takeAlertOutcomes?(): Record<string, number>
}

const native =
  requireOptionalNativeModule<BuddiesKeychainNative>('BuddiesKeychain')

export function isAvailable(): boolean {
  return (
    (Platform.OS === 'ios' || Platform.OS === 'android') &&
    native !== null &&
    (native.buddiesKeychainVersion ?? 0) >= 1
  )
}

export async function peekRootSeed(): Promise<string | null> {
  if (!isAvailable()) return null
  return native!.peekRootSeedAsync
    ? native!.peekRootSeedAsync()
    : native!.peekRootSeed()
}

export async function getOrCreateRootSeed(): Promise<string> {
  if (!isAvailable()) {
    throw new Error('Buddies Keychain requires a newer native binary')
  }
  return native!.getOrCreateRootSeedAsync
    ? native!.getOrCreateRootSeedAsync()
    : native!.getOrCreateRootSeed()
}

export async function deleteRootSeed(): Promise<void> {
  if (!isAvailable()) return
  if (native!.deleteRootSeedAsync) await native!.deleteRootSeedAsync()
  else native!.deleteRootSeed()
}

export function isReplaceAvailable(): boolean {
  return (
    isAvailable() &&
    (native!.buddiesKeychainVersion ?? 0) >= 3 &&
    native!.replaceRootSeedAsync !== undefined
  )
}

export async function replaceRootSeed(seed: string): Promise<void> {
  if (!isReplaceAvailable()) {
    throw new Error('Replacing the root seed requires a newer native binary')
  }
  await native!.replaceRootSeedAsync!(seed)
}

export function rootSeedBackup(): RootSeedBackup | null {
  if (!isAvailable() || !native!.rootSeedBackup) return null
  return native!.rootSeedBackup()
}

export function isAlertContextAvailable(): boolean {
  return (
    isAvailable() &&
    Platform.OS === 'ios' &&
    (native!.buddiesKeychainVersion ?? 0) >= 2 &&
    native!.setAlertContext !== undefined
  )
}

export function setAlertContext(json: string | null): void {
  if (!isAlertContextAvailable()) return
  native!.setAlertContext!(json)
}

export function takeAlertOutcomes(): Record<string, number> {
  if (!isAlertContextAvailable() || !native!.takeAlertOutcomes) return {}
  return native!.takeAlertOutcomes()
}
