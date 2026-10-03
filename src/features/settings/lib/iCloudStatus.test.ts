import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: { relative?: string }) =>
      options?.relative ? `${key}:${options.relative}` : key,
  },
}))
vi.mock('@/lib/dates', () => ({
  formatRelative: (at: number) => String(at),
  formatDateTime: (at: number) => `at ${at}`,
}))

import {
  buildICloudStatus,
  type ICloudStatusInput,
  UPLOAD_GRACE_MS,
} from '@/features/settings/lib/iCloudStatus'

const now = 1_000_000
const base: ICloudStatusInput = {
  enabled: true,
  available: true,
  paused: false,
  needsResolution: false,
  issue: null,
  uploadIssue: null,
  pendingPush: false,
  uploadPendingSince: null,
  uploadConfirmationSupported: true,
  lastPulledAt: null,
  lastPushedAt: null,
  lastUploadedAt: null,
  now,
}
const text = (input: Partial<ICloudStatusInput>) =>
  buildICloudStatus({ ...base, ...input }).text

describe('buildICloudStatus', () => {
  it('reports the last confirmed upload or pull, not a local write', () => {
    expect(text({ lastPushedAt: 900, lastUploadedAt: 500 })).toBe(
      'iCloudStatusLastSyncedConfirmed:500'
    )
    expect(text({ lastPushedAt: 900, lastPulledAt: 600 })).toBe(
      'iCloudStatusLastSyncedConfirmed:600'
    )
    expect(text({ lastPushedAt: 900 })).toBe('iCloudStatusWaitingForFirstSync')
    expect(buildICloudStatus({ ...base, lastUploadedAt: 500 }).subtitle).toBe(
      'at 500'
    )
  })

  it('says it is uploading once confirmation outlasts the grace period', () => {
    const recent = { lastUploadedAt: 500, lastPushedAt: now }
    expect(text({ ...recent, uploadPendingSince: now - 1_000 })).toBe(
      'iCloudStatusLastSyncedConfirmed:500'
    )
    expect(text({ ...recent, uploadPendingSince: now - UPLOAD_GRACE_MS })).toBe(
      'iCloudStatusUploading'
    )
  })

  it('puts full iCloud storage ahead of other issues', () => {
    expect(
      text({
        uploadIssue: 'icloud-full',
        issue: 'read-failed',
        pendingPush: true,
        lastUploadedAt: 500,
      })
    ).toBe('iCloudStatusStorageFull')
  })

  it('shows other upload failures after the existing issues', () => {
    expect(text({ uploadIssue: 'upload-failed' })).toBe(
      'iCloudStatusUploadFailed'
    )
    expect(text({ uploadIssue: 'upload-failed', issue: 'newer-version' })).toBe(
      'iCloudStatusNewerVersion'
    )
  })

  it('keeps the existing states', () => {
    expect(text({ needsResolution: true, uploadIssue: 'icloud-full' })).toBe(
      'iCloudStatusNeedsResolution'
    )
    expect(text({ paused: true })).toBe('iCloudStatusSupporterPaused')
    expect(text({ enabled: false })).toBe('iCloudStatusDisabled')
    expect(text({ available: false })).toBe('iCloudStatusUnavailable')
    expect(text({ issue: 'invalid-file' })).toBe('iCloudStatusInvalidFile')
    expect(text({ issue: 'read-failed' })).toBe('iCloudStatusRetryNeeded')
    expect(text({ pendingPush: true })).toBe('iCloudStatusPendingPush')
  })

  it('shows local activity on a binary that cannot confirm uploads', () => {
    expect(
      text({ uploadConfirmationSupported: false, lastPushedAt: 900 })
    ).toBe('iCloudStatusLastSynced:900')
  })
})
