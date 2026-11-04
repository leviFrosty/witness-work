import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  firstSyncStallReason,
  firstSyncState,
  onFirstSyncChange,
  onFirstSyncRetry,
  releaseFirstSync,
  resetFirstSync,
  retryFirstSync,
  stallFirstSync,
  stallReasonShown,
} from '@/app/sync/webFirstSync'

afterEach(() => resetFirstSync())

describe('webFirstSync', () => {
  it('starts checking', () => {
    expect(firstSyncState()).toBe('checking')
  })

  it('stalls on a retryable outcome and checks again on Retry', () => {
    const handler = vi.fn()
    const listener = vi.fn()
    onFirstSyncRetry(handler)
    onFirstSyncChange(listener)

    stallFirstSync()
    expect(firstSyncState()).toBe('stalled')
    expect(listener).toHaveBeenCalledTimes(1)

    retryFirstSync()
    expect(firstSyncState()).toBe('checking')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stays released: sync can’t run for this account, so onboarding may', () => {
    releaseFirstSync()
    stallFirstSync()
    expect(firstSyncState()).toBe('released')
  })

  it('stops calling a retry handler once unsubscribed', () => {
    const handler = vi.fn()
    onFirstSyncRetry(handler)()
    retryFirstSync()
    expect(handler).not.toHaveBeenCalled()
  })

  it('starts over on reset (another account)', () => {
    releaseFirstSync()
    resetFirstSync()
    expect(firstSyncState()).toBe('checking')
  })

  it('remembers why it stalled, until Retry', () => {
    const listener = vi.fn()
    onFirstSyncChange(listener)
    stallFirstSync()
    expect(firstSyncStallReason()).toBe(null)
    stallFirstSync('unreadable')
    expect(firstSyncStallReason()).toBe('unreadable')
    expect(listener).toHaveBeenCalledTimes(2)
    retryFirstSync()
    expect(firstSyncStallReason()).toBe(null)
    stallFirstSync('paused')
    resetFirstSync()
    expect(firstSyncStallReason()).toBe(null)
  })
})

describe('stallReasonShown', () => {
  const none = {
    recorded: null,
    cloudSyncConfigEnabled: true,
    syncIssue: null,
  } as const

  it('says nothing for a connection problem', () => {
    expect(stallReasonShown(none)).toBe(null)
    expect(stallReasonShown({ ...none, syncIssue: 'read-failed' })).toBe(null)
  })

  it('names the server’s switch while it’s off', () => {
    expect(stallReasonShown({ ...none, cloudSyncConfigEnabled: false })).toBe(
      'paused'
    )
  })

  it.each(['newer-version', 'invalid-file'] as const)(
    'names a slot this browser can’t read (%s)',
    (syncIssue) => {
      expect(stallReasonShown({ ...none, syncIssue })).toBe('unreadable')
    }
  )

  it('prefers the reason the decision recorded', () => {
    expect(
      stallReasonShown({
        ...none,
        recorded: 'unreadable',
        cloudSyncConfigEnabled: false,
      })
    ).toBe('unreadable')
  })
})
