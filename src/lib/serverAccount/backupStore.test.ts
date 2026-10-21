import { describe, expect, it, vi } from 'vitest'

const saved = vi.hoisted(() => ({ set: vi.fn() }))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-crypto', () => ({ getRandomBytes: vi.fn() }))
vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    getString() {
      return undefined
    }
    set = saved.set
  },
}))
vi.mock('@/lib/installId', () => ({
  androidDeviceInstallId: vi.fn(),
  getOrCreateInstallId: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ logger: { log: vi.fn(), warn: vi.fn() } }))

import { backupSchedule, useBackupState } from '@/lib/serverAccount/backupStore'

describe('backupSchedule.set', () => {
  it('saves a change', () => {
    backupSchedule.set({ nextAttemptAt: 1_000 })
    expect(backupSchedule.get().nextAttemptAt).toBe(1_000)
    expect(saved.set).toHaveBeenCalledTimes(1)
  })

  it('keeps the state, unsaved, when nothing changes', () => {
    saved.set.mockClear()
    const before = useBackupState.getState()
    backupSchedule.set({ nextAttemptAt: 1_000 })
    expect(useBackupState.getState()).toBe(before)
    expect(saved.set).not.toHaveBeenCalled()
  })
})
