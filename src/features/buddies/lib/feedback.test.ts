import { gunzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { fromB64u } from '@/features/buddies/lib/bytes'
import { initialBuddiesState } from '@/features/buddies/lib/state'
import {
  buddiesDiagnostics,
  encodeAttachment,
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
vi.mock('@/lib/backupFile', () => ({
  createBackupFile: () => ({ contactStore: { contacts: [{ name: 'Ann' }] } }),
}))
vi.mock('@/features/buddies/stores/buddiesStore', async () => {
  const { initialBuddiesState } = await import('@/features/buddies/lib/state')
  return { useBuddies: { getState: () => initialBuddiesState } }
})

const decode = (parts: string[]) =>
  JSON.parse(gunzipSync(fromB64u(parts.join(''))).toString())

describe('encodeAttachment', () => {
  it('round-trips through gzip and base64url', () => {
    const value = { contacts: [{ name: 'Ann', notes: 'ünïcode ✓' }] }
    expect(decode(encodeAttachment(value)!)).toEqual(value)
  })

  it('splits large payloads into event-sized parts', () => {
    // Random-ish text barely compresses, so this spans several parts.
    const noise = Array.from({ length: 200_000 }, (_, i) =>
      ((i * 2654435761) >>> 0).toString(36)
    ).join('')
    const parts = encodeAttachment({ noise })!
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(500_000)
    expect(decode(parts)).toEqual({ noise })
  })
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
  it('sends diagnostics then the backup, tagged with the feedback id', async () => {
    const capture = vi.fn()
    const client = { capture, flush: vi.fn(async () => {}) }
    await sendFeedbackAttachments(
      client as never,
      { id: 'survey', name: 'Buddies' } as never,
      'fb1'
    )
    expect(capture.mock.calls.map(([event]) => event)).toEqual([
      'survey attachment',
      'survey attachment',
    ])
    const [[, diagnostics], [, backup]] = capture.mock.calls
    expect(diagnostics).toMatchObject({
      $survey_id: 'survey',
      feedback_id: 'fb1',
      kind: 'diagnostics',
      platform: 'ios',
      app_version: '1.0.0',
      backup_parts: 1,
    })
    expect(backup).toMatchObject({ kind: 'backup', part: 1, parts: 1 })
    expect(decode([backup.data])).toEqual({
      contactStore: { contacts: [{ name: 'Ann' }] },
    })
  })
})
