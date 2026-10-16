import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))

import { backupFailureDetail } from '@/app/account/backupCopy'

describe('backup failure detail', () => {
  it('leaves a problem the Account section above already says to it', () => {
    expect(backupFailureDetail('unverified', 'unverified')).toBeNull()
    expect(backupFailureDetail('verify_later', 'unverified')).toBeNull()
    expect(backupFailureDetail('update', 'updateRequired')).toBeNull()
  })

  it('explains a failure the account has since got past', () => {
    expect(backupFailureDetail('unverified', 'active')).toBe(
      'account_unverifiedBody'
    )
    expect(backupFailureDetail('verify_later', 'checking')).toBe(
      'backup_errorVerifyLater'
    )
    expect(backupFailureDetail('update', 'active')).toBe(
      'account_updateRequired'
    )
  })

  it("explains the backup's own problems", () => {
    expect(backupFailureDetail('offline', 'unverified')).toBe(
      'backup_errorOffline'
    )
    expect(backupFailureDetail('too_large', 'active')).toBe(
      'backup_errorTooLarge'
    )
    expect(backupFailureDetail('server', 'updateRequired')).toBe(
      'backup_errorServer'
    )
  })
})
