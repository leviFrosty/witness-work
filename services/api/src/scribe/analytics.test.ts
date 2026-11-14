import { describe, expect, it } from 'vitest'
import { scribeTranscribeLogLine, turnGap } from './analytics'
import type { WireMessage } from './wire'

const user = (at: string): WireMessage => ({ role: 'user', at, content: [{ type: 'text', text: 'x' }] })
const assistant: WireMessage = { role: 'assistant', content: [{ type: 'text', text: 'ok' }] }

describe('turnGap', () => {
  const after = (at: string) => [user('2026-10-21T09:30-05:00'), assistant, user(at)]

  it.each([
    ['2026-10-21T09:30:20-05:00', '<5'],
    ['2026-10-21T09:34:59-05:00', '<5'],
    ['2026-10-21T09:35-05:00', '5-30'],
    ['2026-10-21T09:59-05:00', '5-30'],
    ['2026-10-21T10:00-05:00', '30-120'],
    ['2026-10-21T11:29-05:00', '30-120'],
    ['2026-10-21T11:30-05:00', '>120'],
    ['2026-10-22T08:00-05:00', '>120'],
  ])('a turn sent at %s → %s', (at, bucket) => {
    expect(turnGap(after(at), 0)).toBe(bucket)
  })

  it('compares instants across offsets (a time-zone change)', () => {
    expect(turnGap(after('2026-10-21T14:40Z'), 0)).toBe('5-30')
  })

  it('is null on the first turn, on later steps, and for a clock that ran backwards', () => {
    expect(turnGap([user('2026-10-21T09:30-05:00')], 0)).toBeNull()
    expect(turnGap(after('2026-10-21T10:30-05:00'), 1)).toBeNull()
    expect(turnGap(after('2026-10-21T09:00-05:00'), 0)).toBeNull()
  })

  it('reads only the last two user messages', () => {
    const messages = [user('2026-10-20T09:00-05:00'), ...after('2026-10-21T09:31-05:00')]
    expect(turnGap(messages, 0)).toBe('<5')
  })
})

describe('scribeTranscribeLogLine', () => {
  it('carries the cache writes and the billed cost', () => {
    const line = JSON.parse(
      scribeTranscribeLogLine({
        plan: 'free',
        platform: 'ios',
        mimeType: 'image/jpeg',
        bytes: 300_000,
        textChars: 120,
        truncated: false,
        inputTokens: 4_690,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 146,
        units: 5_420,
        costUsd: 0.000542,
        model: 'openai/gpt-6-luna',
        provider: 'Azure',
        latencyMs: 3_000,
        errorCode: null,
      })
    )
    expect(line).toMatchObject({
      event: 'api_scribe_transcribe',
      cache_write_tokens: 0,
      cost_usd: 0.000542,
      bytes: '256k-1m',
    })
  })
})
