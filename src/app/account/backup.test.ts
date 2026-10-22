import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http/request'

// Delete Backup turns backup off while it deletes, so no upload puts the slot
// back. One that fails (offline) leaves backup on: nothing was deleted.

const fake = vi.hoisted(() => ({
  deleteError: null as Error | null,
  deletes: [] as (string | undefined)[],
  noteChange: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('react-native', () => ({
  AppState: { currentState: 'active' },
  Platform: { OS: 'ios' },
}))
vi.mock('expo-crypto', () => ({ getRandomBytes: vi.fn() }))
vi.mock('expo-device', () => ({ modelName: 'iPhone' }))
vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    getString() {
      return undefined
    }
    set() {}
  },
}))
vi.mock('@/lib/installId', () => ({
  androidDeviceInstallId: vi.fn(),
  getOrCreateInstallId: vi.fn(),
}))
vi.mock('@/app/account/accountKey', () => ({
  accountKeyAvailable: () => true,
  accountKey: { peek: async () => new Uint8Array(32).fill(7) },
}))
vi.mock('@/app/account/backupData', () => ({}))
vi.mock('@/app/sync/localChanges', () => ({
  subscribeToLocalDataChanges: vi.fn(),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/appLifecycle', () => ({
  addBackgroundListener: vi.fn(),
  addForegroundListener: vi.fn(),
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/serverAccount/backupAccess', () => ({
  backupAccessFor: vi.fn(),
  backupErrorFrom: vi.fn(),
  withBackupAccess: (
    accountKey: Uint8Array,
    op: (access: unknown) => Promise<unknown>
  ) => op({ accountKey, accountId: 'account', options: {} }),
}))
vi.mock('@/lib/serverAccount/backupClient', () => ({
  BACKUP_LIMITS: { bytes: 1_000_000 },
  deleteBackup: vi.fn(async (_options: unknown, slotId?: string) => {
    fake.deletes.push(slotId)
    if (fake.deleteError) throw fake.deleteError
  }),
  listBackups: vi.fn(),
  putBackup: vi.fn(),
}))
vi.mock('@/lib/serverAccount/backupScheduler', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createBackupScheduler: () => ({
    noteChange: fake.noteChange,
    stop: fake.stop,
  }),
}))

const { deleteAllBackups, deleteBackupSlot, refreshBackupSlots } = await import(
  './backup'
)
const { listBackups } = await import('@/lib/serverAccount/backupClient')
const { useBackupState } = await import('@/lib/serverAccount/backupStore')
const { analytics } = await import('@/lib/analytics')

beforeEach(() => {
  fake.deleteError = null
  fake.deletes = []
  vi.clearAllMocks()
  useBackupState.setState({ enabled: true, slotId: 'mine', slots: [] })
})

describe('deleting backups', () => {
  it('turns backup off once every slot is deleted', async () => {
    await deleteAllBackups('settings')
    expect(fake.deletes).toEqual([undefined])
    expect(useBackupState.getState().enabled).toBe(false)
    expect(fake.stop).toHaveBeenCalled()
    expect(analytics.capture).toHaveBeenCalledWith('account_backup_changed', {
      enabled: false,
      source: 'settings',
      deleted_server_copy: true,
    })
  })

  it('leaves backup on when deleting every slot fails offline', async () => {
    fake.deleteError = new HttpError('offline')
    await expect(deleteAllBackups('settings')).rejects.toBe(fake.deleteError)
    expect(useBackupState.getState().enabled).toBe(true)
    expect(fake.noteChange).toHaveBeenCalled()
    expect(analytics.capture).not.toHaveBeenCalledWith(
      'account_backup_changed',
      expect.anything()
    )
  })

  it("leaves backup on when deleting this device's slot fails", async () => {
    fake.deleteError = new HttpError('server', 503)
    await expect(deleteBackupSlot('mine', 'settings')).rejects.toBe(
      fake.deleteError
    )
    expect(fake.deletes).toEqual(['mine'])
    expect(useBackupState.getState().enabled).toBe(true)
  })

  it("keeps backup on when deleting another device's slot", async () => {
    await deleteBackupSlot('other', 'settings')
    expect(useBackupState.getState().enabled).toBe(true)
    expect(fake.stop).not.toHaveBeenCalled()
  })
})

describe('listing slots', () => {
  const slot = (slotId: string) => ({ slotId }) as never

  it('keeps a deleted slot gone when an older listing arrives after the delete', async () => {
    let answer!: (slots: never[]) => void
    vi.mocked(listBackups).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve
      })
    )
    useBackupState.setState({ slots: [slot('mine'), slot('other')] })
    const listing = refreshBackupSlots({ report: false })
    await deleteBackupSlot('other', 'settings')
    answer([slot('mine'), slot('other')])
    await listing
    expect(useBackupState.getState().slots).toEqual([slot('mine')])
  })

  it('keeps the newest of two listings', async () => {
    const answers: ((slots: never[]) => void)[] = []
    vi.mocked(listBackups).mockImplementation(
      () => new Promise((resolve) => answers.push(resolve))
    )
    const older = refreshBackupSlots({ report: false })
    const newer = refreshBackupSlots({ report: false })
    await vi.waitFor(() => expect(answers).toHaveLength(2))
    answers[1]([slot('new')])
    await newer
    answers[0]([slot('old')])
    await older
    expect(useBackupState.getState().slots).toEqual([slot('new')])
  })
})
