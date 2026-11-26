import { describe, expect, it, vi } from 'vitest'
import { initialBuddiesState } from '@/features/buddies/lib/state'
import {
  buddiesDiagnostics,
  sendFeedbackAttachments,
} from '@/features/buddies/lib/feedback'

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '1',
}))
vi.mock('expo-device', () => ({
  modelName: 'iPhone',
  osName: 'iOS',
  osVersion: '26.0',
  deviceType: 1,
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('expo-crypto', () => ({
  getRandomBytes: (length: number) => new Uint8Array(length),
}))
vi.mock('@/features/buddies/stores/buddiesStore', async () => {
  const { initialBuddiesState } = await import('@/features/buddies/lib/state')
  return { useBuddies: { getState: () => initialBuddiesState } }
})

describe('buddiesDiagnostics', () => {
  it("reports counts, never buddies' names or shared content", () => {
    const summary = buddiesDiagnostics({
      ...initialBuddiesState,
      registeredInboxId: 'inbox-secret',
      avatarThumbnail: { source: 'file://me.jpg', data: 'photo-bytes' },
    })
    expect(summary.buddies_inbox_registered).toBe(true)
    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('inbox-secret')
    expect(serialized).not.toContain('photo-bytes')
  })
})

describe('sendFeedbackAttachments', () => {
  it('sends only diagnostics, tagged with the feedback id', async () => {
    const capture = vi.fn()
    const client = { capture, flush: vi.fn(async () => {}) }
    await sendFeedbackAttachments(
      client as never,
      { id: 'survey', name: 'Buddies' } as never,
      'fb1'
    )
    expect(capture).toHaveBeenCalledOnce()
    const [[event, diagnostics]] = capture.mock.calls
    expect(event).toBe('survey attachment')
    expect(diagnostics).toMatchObject({
      $survey_id: 'survey',
      feedback_id: 'fb1',
      kind: 'diagnostics',
      platform: 'ios',
      app_version: '1.0.0',
      buddies_count: 0,
    })
    expect(Object.keys(diagnostics)).not.toContain('data')
    expect(client.flush).toHaveBeenCalledOnce()
  })
})
