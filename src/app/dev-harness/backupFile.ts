import { getRandomBytes } from 'expo-crypto'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import {
  type BackupFileLockChoice,
  createLockedBackupFile,
  unlockWithThisAccount,
} from '@/app/sync/lockedBackupFile'
import { createBackupFile, isBackupFile } from '@/lib/backupFile'
import {
  type LockedBackupFile,
  lockWithAccountKey,
  lockWithPassword,
  PASSWORD_KDF,
  type PasswordKdf,
  readLockedBackupFile,
  unlockWithPassword,
} from '@/lib/backupFileLock'

let last: unknown = null
let locked: LockedBackupFile | null = null

const tracked = (work: () => Promise<unknown>) => {
  last = null
  void work()
    .then((value) => {
      last = value ?? { done: true }
    })
    .catch((error: unknown) => {
      last = { error: String(error) }
    })
  return 'started'
}

const storeNames = (file: unknown) =>
  isBackupFile(file)
    ? Object.keys(file).filter((key) => key.endsWith('Store'))
    : null

type TestFile = 'locked' | 'plain' | 'otherAccount'

async function writeTestFile(kind: TestFile): Promise<string> {
  const file =
    kind === 'plain'
      ? createBackupFile()
      : kind === 'otherAccount'
        ? lockWithAccountKey(createBackupFile(), getRandomBytes(32), {
            origin: { deviceName: 'verify', platform: 'ios', createdAt: 0 },
            randomBytes: getRandomBytes,
          })
        : locked
  if (!file) throw new Error('Nothing locked yet')
  const uri = `${FileSystem.cacheDirectory}ww-verify-${kind}.json`
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(file))
  return uri
}

export const backupFileHarness = {
  bench: (kdf: Partial<PasswordKdf> = {}) =>
    tracked(async () => {
      const cost = { ...PASSWORD_KDF, ...kdf }
      const startedAt = Date.now()
      await lockWithPassword({}, 'benchmark password', {
        kdf: cost,
        origin: { deviceName: 'bench', platform: 'ios', createdAt: 0 },
        randomBytes: getRandomBytes,
      })
      return { ms: Date.now() - startedAt, ...cost }
    }),
  lock: (lock: BackupFileLockChoice['lock'], password = '') =>
    tracked(async () => {
      const startedAt = Date.now()
      locked = await createLockedBackupFile(
        lock === 'password' ? { lock, password } : { lock }
      )
      const { data, ...header } = locked
      return { ms: Date.now() - startedAt, header, chars: data.length }
    }),
  unlock: (password = '') =>
    tracked(async () => {
      if (!locked) throw new Error('Nothing locked yet')
      const file = readLockedBackupFile(JSON.parse(JSON.stringify(locked)))
      const startedAt = Date.now()
      const opened =
        file.lock === 'password'
          ? await unlockWithPassword(file, password)
          : await unlockWithThisAccount(file)
      if (!opened) return { opened: false, reason: 'no account key' }
      return {
        ms: Date.now() - startedAt,
        deviceName: opened.deviceName,
        platform: opened.platform,
        stores: storeNames(opened.file),
      }
    }),

  save: (kind: TestFile = 'locked') =>
    tracked(async () => ({ uri: await writeTestFile(kind) })),

  share: (kind: TestFile = 'locked') =>
    tracked(async () => {
      const uri = await writeTestFile(kind)
      await Sharing.shareAsync(uri)
      return { uri }
    }),
  get last() {
    return last
  },
}
