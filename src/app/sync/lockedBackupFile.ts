import { getRandomBytes } from 'expo-crypto'
import { deviceName, devicePlatform } from '@/lib/devicePlatform'
import { accountKey, accountKeyAvailable } from '@/app/account/accountKey'
import { createBackupFile } from '@/lib/backupFile'
import {
  type LockedBackupFile,
  lockWithAccountKey,
  lockWithPassword,
  type UnlockedBackupFile,
  unlockWithAccountKey,
} from '@/lib/backupFileLock'

/**
 * Settings → Backup's file, locked (`backupFileLock.ts`): to this device's
 * account key, for the User's own devices, or with a password, for sharing.
 */

export type BackupFileLockChoice =
  | { lock: 'account' }
  | { lock: 'password'; password: string }

/** Whether this binary can hold an account key to lock a file to. */
export const accountLockAvailable = () => accountKeyAvailable()

const origin = () => ({
  deviceName: deviceName(),
  platform: devicePlatform(),
  createdAt: Date.now(),
})

/**
 * The backup of the stores as they are now, locked. Locking to the account
 * creates the account key when this device has none yet.
 */
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

/**
 * Opens an `account` file with this device's key. Null when this device has no
 * account key; `BackupUnlockError('key')` when it's another account's file.
 */
export async function unlockWithThisAccount(
  file: LockedBackupFile
): Promise<UnlockedBackupFile | null> {
  if (!accountLockAvailable()) return null
  const key = await accountKey.peek()
  return key ? unlockWithAccountKey(file, key) : null
}
