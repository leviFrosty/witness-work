import { getRandomBytes } from 'expo-crypto'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { accountKey, accountKeyAvailable } from '@/app/account/accountKey'
import { createBackupFile } from '@/lib/backupFile'
import {
  type LockedBackupFile,
  lockWithAccountKey,
  lockWithPassword,
  type UnlockedBackupFile,
  unlockWithAccountKey,
} from '@/lib/backupFileLock'

export type BackupFileLockChoice =
  | { lock: 'account' }
  | { lock: 'password'; password: string }

export const accountLockAvailable = () => accountKeyAvailable()

const origin = () => ({
  deviceName:
    Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android'),
  platform: Platform.OS === 'android' ? ('android' as const) : ('ios' as const),
  createdAt: Date.now(),
})

export async function createLockedBackupFile(
  choice: BackupFileLockChoice,
  onProgress?: (fraction: number) => void
): Promise<LockedBackupFile> {
  const file = createBackupFile()
  const options = { origin: origin(), randomBytes: getRandomBytes }
  if (choice.lock === 'password')
    return lockWithPassword(file, choice.password, { ...options, onProgress })
  return lockWithAccountKey(file, await accountKey.getOrCreate(), options)
}

export async function unlockWithThisAccount(
  file: LockedBackupFile
): Promise<UnlockedBackupFile | null> {
  if (!accountLockAvailable()) return null
  const key = await accountKey.peek()
  return key ? unlockWithAccountKey(file, key) : null
}
