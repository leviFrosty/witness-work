import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupSlot } from '@/lib/serverAccount/backupClient'

// The restore offer on a new phone (ADR 0026 §4, ADR 0030 §3): Cloud Sync
// skips it only when another device's slot is at least as new as the newest
// backup. Listings are fakes; the alert answers Not Now.

const fake = vi.hoisted(() => ({
  newestSyncAt: null as number | null,
  backups: [] as BackupSlot[] | Error,
  alerts: [] as string[],
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Alert: {
    alert: (
      title: string,
      _message: string,
      buttons: { onPress?: () => void }[]
    ) => {
      fake.alerts.push(title)
      // Not Now.
      buttons[0]?.onPress?.()
    },
  },
}))
vi.mock('@/app/sync/cloudSync', () => ({
  cloudSyncNewestSlotAt: vi.fn(async () => fake.newestSyncAt),
}))
vi.mock('@/lib/serverAccount/backupClient', () => ({
  listBackups: vi.fn(async () => {
    if (fake.backups instanceof Error) throw fake.backups
    return fake.backups
  }),
  getBackup: vi.fn(),
}))
vi.mock('@/lib/serverAccount/backupAccess', () => ({
  withBackupAccess: (
    accountKey: Uint8Array,
    op: (access: unknown) => Promise<unknown>
  ) => op({ accountKey, accountId: 'account', options: {} }),
}))
vi.mock('@/app/account/accountKey', () => ({
  accountKeyAvailable: () => true,
  accountKey: { peek: async () => new Uint8Array(32).fill(7) },
}))
vi.mock('@/app/account/backup', () => ({ enableBackup: vi.fn() }))
vi.mock('@/app/account/backupData', () => ({}))
vi.mock('@/app/sync/iCloudSync', () => ({
  hasMeaningfulLocalData: () => false,
}))
vi.mock('@/lib/syncTransport/provider', () => ({ usesCloudSync: () => true }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: {
    getState: () => ({
      iCloudSyncNeedsResolution: false,
      iCloudSyncEnabled: true,
    }),
  },
}))
vi.mock('@/lib/serverAccount/backupStore', () => ({
  logBackup: vi.fn(),
  useBackupState: {
    getState: () => ({ enabled: false, restoreOfferedFor: null }),
    setState: vi.fn(),
  },
}))
vi.mock('@/lib/serverAccount/backupCrypto', () => ({
  BackupOpenError: class extends Error {},
  deriveBackupKey: vi.fn(),
  openBackup: vi.fn(),
}))
vi.mock('@/lib/serverAccount/backupScheduler', () => ({
  BackupError: class extends Error {
    code = 'server'
  },
}))
vi.mock('@/lib/serverAccount/keys', () => ({
  deriveAccountSigningKey: () => ({ publicKey: 'account-pub' }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/dates', () => ({ formatDateTime: () => 'a date' }))

const { offerRestore, SYNC_COVERS_BACKUP_GRACE_MS } = await import(
  './backupRestore'
)
const { cloudSyncNewestSlotAt } = await import('@/app/sync/cloudSync')

const T = Date.UTC(2026, 8, 1, 12)
const DAY = 24 * 60 * 60_000
const backupAt = (uploadedAt: number, slotId = 'phone'): BackupSlot => ({
  slotId,
  size: 1_000,
  uploadedAt,
})

beforeEach(() => {
  fake.newestSyncAt = null
  fake.backups = []
  fake.alerts = []
  vi.mocked(cloudSyncNewestSlotAt).mockClear()
})

describe('offerRestore on a new phone Cloud Sync covers', () => {
  it('offers a backup 30 days newer than the newest sync slot', async () => {
    // A rarely used iPad's slot, and the lost iPhone's backup from iCloud.
    fake.newestSyncAt = T
    fake.backups = [backupAt(T + 30 * DAY)]

    const result = await offerRestore('recovery_key')

    expect(fake.alerts).toEqual(['backup_restoreTitle'])
    expect(result).toEqual({ outcome: 'skipped' })
  })

  it('offers when any one backup is newer than every sync slot', async () => {
    fake.newestSyncAt = T
    fake.backups = [backupAt(T - DAY, 'ipad'), backupAt(T + 2 * DAY, 'phone')]

    expect(await offerRestore('handoff')).toEqual({ outcome: 'skipped' })
    expect(fake.alerts).toEqual(['backup_restoreTitle'])
  })

  it('skips the offer when a sync slot is newer than the backup', async () => {
    fake.newestSyncAt = T + DAY
    fake.backups = [backupAt(T)]

    const result = await offerRestore('recovery_key')

    expect(result).toEqual({ outcome: 'synced', combine: false })
    expect(fake.alerts).toEqual([])
  })

  it('skips it for a device on both, whose backup trails its slot', async () => {
    // Its slot 5 s after the edit, its backup after the 30 s debounce.
    fake.newestSyncAt = T
    fake.backups = [backupAt(T + 25_000)]
    expect(await offerRestore('fresh_install')).toEqual({
      outcome: 'synced',
      combine: false,
    })

    fake.backups = [backupAt(T + SYNC_COVERS_BACKUP_GRACE_MS + 1)]
    expect(await offerRestore('fresh_install')).toEqual({ outcome: 'skipped' })
  })

  it('leaves it to Cloud Sync when the backups cannot be listed', async () => {
    fake.newestSyncAt = T
    fake.backups = new Error('offline')

    expect(await offerRestore('handoff')).toEqual({
      outcome: 'synced',
      combine: false,
    })
    expect(fake.alerts).toEqual([])
  })

  it('offers as before without another device on Cloud Sync', async () => {
    fake.backups = [backupAt(T)]

    expect(await offerRestore('recovery_key')).toEqual({ outcome: 'skipped' })
    expect(fake.alerts).toEqual(['backup_restoreTitle'])
  })

  it('never asks Cloud Sync from Settings', async () => {
    fake.newestSyncAt = T + DAY
    fake.backups = [backupAt(T)]

    expect(await offerRestore('settings')).toEqual({ outcome: 'skipped' })
    expect(cloudSyncNewestSlotAt).not.toHaveBeenCalled()
  })
})
