import { toB64u } from '@/lib/bytes'
import { webAccountKey } from '@/lib/accountKey/webAccountKey'

/**
 * The web's account key (the "root seed"), with the native module's API: it's
 * sealed in IndexedDB (`webAccountKey`) instead of iCloud Keychain or Block
 * Store, and loaded at launch. The browser never makes one here; it arrives
 * with a sign-in, or web sign-up makes it (docs/passkeys-protocol.md).
 */

export type RootSeedBackup =
  | 'cloud'
  | 'device'
  | 'restored'
  | 'pending'
  | 'unavailable'

/** Whether this browser holds an account key: it's signed in. */
export function isAvailable(): boolean {
  return webAccountKey.current() !== null
}

export async function peekRootSeed(): Promise<string | null> {
  const key = await webAccountKey.peek()
  return key ? toB64u(key) : null
}

/** The seed. Never made here: without one, the browser isn't signed in. */
export async function getOrCreateRootSeed(): Promise<string> {
  const key = await webAccountKey.peek()
  if (!key) throw new Error('This browser is not signed in')
  return toB64u(key)
}

/**
 * Refused: a browser without its key is signed out, and its data goes with the
 * key (`webAccount.signOut`), never the key alone.
 */
export async function deleteRootSeed(): Promise<void> {
  throw new Error('The web deletes its account key by signing out')
}

/** Another account signs in on the web after a wipe instead. */
export function isReplaceAvailable(): boolean {
  return false
}

export async function replaceRootSeed(_seed: string): Promise<void> {
  throw new Error('The web replaces its account key by signing in again')
}

export function rootSeedBackup(): RootSeedBackup | null {
  return null
}

export function isAlertContextAvailable(): boolean {
  return false
}

export function setAlertContext(_json: string | null): void {}

export function takeAlertOutcomes(): Record<string, number> {
  return {}
}
