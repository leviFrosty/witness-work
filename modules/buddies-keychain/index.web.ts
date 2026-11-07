import { toB64u } from '@/lib/bytes'
import { webAccountKey } from '@/lib/accountKey/webAccountKey'

export type RootSeedBackup =
  | 'cloud'
  | 'device'
  | 'restored'
  | 'pending'
  | 'unavailable'

export function isAvailable(): boolean {
  return webAccountKey.current() !== null
}

export async function peekRootSeed(): Promise<string | null> {
  const key = await webAccountKey.peek()
  return key ? toB64u(key) : null
}

export async function getOrCreateRootSeed(): Promise<string> {
  const key = await webAccountKey.peek()
  if (!key) throw new Error('This browser is not signed in')
  return toB64u(key)
}

export async function deleteRootSeed(): Promise<void> {
  throw new Error('The web deletes its account key by signing out')
}

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

export function refusedInboxes(): string[] {
  return []
}
