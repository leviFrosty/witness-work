import { createElement, useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PasswordUnlockResult } from '@/features/settings/components/backup/UnlockBackupSheet'
import type { LockedBackupFile } from '@/lib/backupFileLock'

const mocks = vi.hoisted(() => ({
  contents: '',
  /** This device's account key; null when it has none. */
  key: null as Uint8Array | null,
  /** What the password sheet ends with once it's asked. */
  password: null as PasswordUnlockResult | null,
  asked: [] as LockedBackupFile[],
}))

vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('@/lib/backupFile', () => ({
  isBackupFile: (data: unknown) =>
    typeof data === 'object' && data !== null && 'contactStore' in data,
}))
vi.mock('@/stores/serviceReport', () => ({
  migrateServiceReports: (reports: unknown) => reports,
}))
vi.mock('@/app/sync/backupFileRestore', () => ({
  restoreBackupFile: vi.fn(() => ({ ok: true, droppedRecords: 0 })),
}))
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///picked/witness-work-backup.json' }],
  })),
}))
vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: vi.fn(async () => mocks.contents),
}))
vi.mock('@/app/sync/lockedBackupFile', async () => {
  const { unlockWithAccountKey } = await import('@/lib/backupFileLock')
  return {
    unlockWithThisAccount: async (file: LockedBackupFile) =>
      mocks.key ? unlockWithAccountKey(file, mocks.key) : null,
  }
})
// The sheet itself is proven on device; here it answers as scripted.
vi.mock('@/features/settings/components/backup/UnlockBackupSheet', () => ({
  default: function UnlockBackupSheet({
    file,
    onFinished,
  }: {
    file: LockedBackupFile | null
    onFinished: (result: PasswordUnlockResult) => void
  }) {
    useEffect(() => {
      if (!file || !mocks.password) return
      mocks.asked.push(file)
      onFinished(mocks.password)
    }, [file, onFinished])
    return null
  },
}))

import { Alert } from 'react-native'
import { useBackupImport } from '@/app/sync/useBackupImport'
import { restoreBackupFile } from '@/app/sync/backupFileRestore'
import { analytics } from '@/lib/analytics'
import { lockWithAccountKey } from '@/lib/backupFileLock'

type Hook = ReturnType<typeof useBackupImport>

const backup = { version: 1, contactStore: { contacts: [{ id: 'c1' }] } }
const myKey = new Uint8Array(32).fill(7)
const options = {
  origin: { deviceName: 'iPhone', platform: 'ios' as const, createdAt: 0 },
  randomBytes: (length: number) => new Uint8Array(length).fill(3),
}
const passwordFile = JSON.stringify({
  format: 'witnesswork-encrypted-backup',
  v: 1,
  lock: 'password',
  kdf: { alg: 'argon2id', m: 64, t: 1, p: 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA' },
  data: 'AQ',
})

/** Mounts the hook, rendering its sheet, and returns its latest result. */
const renderImport = () => {
  let latest: Hook | undefined
  const Probe = ({ onResult }: { onResult: (hook: Hook) => void }) => {
    const hook = useBackupImport({ source: 'settings' })
    onResult(hook)
    return hook.unlockSheet
  }
  act(() => {
    create(
      createElement(Probe, {
        onResult: (hook) => {
          latest = hook
        },
      })
    )
  })
  return () => latest as Hook
}

/**
 * Runs an import to the end. It's started, not awaited, inside `act`: the
 * password sheet only renders once that `act` has flushed.
 */
const runImport = async () => {
  const hook = renderImport()
  let result: boolean | undefined
  await act(async () => {
    void hook()
      .importBackup()
      .then((restored) => {
        result = restored
      })
  })
  for (let turn = 0; turn < 20 && result === undefined; turn++)
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  return result
}

const captured = (event: string) =>
  vi
    .mocked(analytics.capture)
    .mock.calls.filter(([name]) => name === event)
    .map(([, properties]) => properties)

describe('restoring a locked backup file', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.key = myKey
    mocks.password = null
    mocks.asked = []
  })

  it('opens an account file with this device’s key, without asking', async () => {
    mocks.contents = JSON.stringify(lockWithAccountKey(backup, myKey, options))
    expect(await runImport()).toBe(true)
    expect(restoreBackupFile).toHaveBeenCalledWith(backup)
    expect(mocks.asked).toHaveLength(0)
    expect(captured('backup_imported')).toEqual([
      expect.objectContaining({ protection: 'account' }),
    ])
  })

  it('asks to sign in when this device has no account key', async () => {
    mocks.contents = JSON.stringify(lockWithAccountKey(backup, myKey, options))
    mocks.key = null
    expect(await runImport()).toBe(false)
    expect(restoreBackupFile).not.toHaveBeenCalled()
    expect(Alert.alert).toHaveBeenCalledWith(
      'backupUnlock_noAccount_title',
      'backupUnlock_noAccount_description'
    )
    expect(captured('import_failed')).toEqual([
      expect.objectContaining({
        stage: 'unlock',
        error_code: 'no_account_key',
      }),
    ])
  })

  it("says so when it's another account's file", async () => {
    mocks.contents = JSON.stringify(
      lockWithAccountKey(backup, new Uint8Array(32).fill(8), options)
    )
    expect(await runImport()).toBe(false)
    expect(restoreBackupFile).not.toHaveBeenCalled()
    expect(Alert.alert).toHaveBeenCalledWith(
      'backupUnlock_otherAccount_title',
      'backupUnlock_otherAccount_description'
    )
    expect(captured('import_failed')).toEqual([
      expect.objectContaining({ error_code: 'wrong_account' }),
    ])
  })

  it('asks for a password file’s password, then restores what it opened', async () => {
    mocks.contents = passwordFile
    mocks.password = {
      outcome: 'unlocked',
      unlocked: { ...options.origin, file: backup },
      wrongPasswords: 2,
    }
    expect(await runImport()).toBe(true)
    expect(mocks.asked).toEqual([expect.objectContaining({ lock: 'password' })])
    expect(restoreBackupFile).toHaveBeenCalledWith(backup)
    expect(captured('backup_imported')).toEqual([
      expect.objectContaining({ protection: 'password', wrong_passwords: 2 }),
    ])
  })

  it('restores nothing when the password sheet is closed', async () => {
    mocks.contents = passwordFile
    mocks.password = { outcome: 'cancelled', wrongPasswords: 1 }
    expect(await runImport()).toBe(false)
    expect(restoreBackupFile).not.toHaveBeenCalled()
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(captured('import_cancelled')).toEqual([
      expect.objectContaining({ stage: 'unlock', wrong_passwords: 1 }),
    ])
  })

  it('tells the User to update for a newer locked file', async () => {
    mocks.contents = JSON.stringify({
      ...JSON.parse(passwordFile),
      v: 2,
    })
    expect(await runImport()).toBe(false)
    expect(Alert.alert).toHaveBeenCalledWith(
      'importErrorNewerFile_title',
      'importErrorNewerFile_description'
    )
    expect(captured('import_failed')).toEqual([
      expect.objectContaining({ error_code: 'newer_version' }),
    ])
  })

  it('still restores an unlocked file from an older version', async () => {
    mocks.contents = JSON.stringify(backup)
    expect(await runImport()).toBe(true)
    expect(restoreBackupFile).toHaveBeenCalledWith(backup)
    expect(captured('backup_imported')).toEqual([
      expect.objectContaining({ protection: 'none' }),
    ])
  })
})
