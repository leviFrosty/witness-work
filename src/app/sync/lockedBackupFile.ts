import { getRandomBytes } from 'expo-crypto'
import { deviceName, devicePlatform } from '@/lib/devicePlatform'
import { accountKey, accountKeyAvailable } from '@/app/account/accountKey'
import { backupFileContents } from '@/app/sync/backupFileContents'
import { olderAccountKeys, serverAccount } from '@/lib/serverAccount'
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
  deviceName: deviceName(),
  platform: devicePlatform(),
  createdAt: Date.now(),
})

export async function createLockedBackupFile(
  choice: BackupFileLockChoice,
  onProgress?: (fraction: number) => void
): Promise<LockedBackupFile> {
  const file = backupFileContents()
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
  if (!key) return null

  const accountId = serverAccount.cached(key)?.accountId
  return unlockWithAccountKey(
    file,
    key,
    accountId ? await olderAccountKeys(accountId, 'backupFile') : []
  )
}
