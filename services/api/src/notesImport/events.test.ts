import { describe, expect, it } from 'vitest'
import {
  formatSSE,
  isTerminalEvent,
  parseLastEventId,
  type ImportEvent,
} from './events'

describe('formatSSE', () => {
  it('frames an event as id / event / data lines', () => {
    const ev: ImportEvent = { type: 'status', seq: 3, status: 'thinking' }
    expect(formatSSE(ev)).toBe(
      'id: 3\nevent: status\ndata: {"type":"status","status":"thinking"}\n\n'
    )
  })

  it('keeps seq on the id line, not in data (so it is the resume cursor)', () => {
    const out = formatSSE({ type: 'progress', seq: 7, chars: 400 })
    expect(out.startsWith('id: 7\n')).toBe(true)
    expect(out).not.toContain('"seq"')
  })

  it('omits the id line for an unsequenced (broadcast-only) cosmetic frame', () => {
    // A reasoning/progress frame the run DO streams without persisting carries
    // no seq; with no `id:` line it never advances the client's Last-Event-ID.
    const out = formatSSE({ type: 'reasoning', text: 'hm' })
    expect(out).toBe('event: reasoning\ndata: {"type":"reasoning","text":"hm"}\n\n')
    expect(out).not.toContain('id:')
  })
})

describe('parseLastEventId', () => {
  it('treats missing / garbled cursors as "from the start" (0)', () => {
    for (const bad of [null, undefined, '', 'abc', '-4'])
      expect(parseLastEventId(bad)).toBe(0)
  })

  it('parses a valid cursor', () => {
    expect(parseLastEventId('12')).toBe(12)
  })
})

describe('isTerminalEvent', () => {
  it('marks done/error/cancelled terminal and progress signals not', () => {
    expect(isTerminalEvent({ type: 'done' })).toBe(true)
    expect(isTerminalEvent({ type: 'error' })).toBe(true)
    expect(isTerminalEvent({ type: 'cancelled' })).toBe(true)
    expect(isTerminalEvent({ type: 'status' })).toBe(false)
    expect(isTerminalEvent({ type: 'reasoning' })).toBe(false)
    expect(isTerminalEvent({ type: 'progress' })).toBe(false)
  })

  it('frames a cancelled terminal event (it carries no payload)', () => {
    expect(formatSSE({ type: 'cancelled', seq: 9 })).toBe(
      'id: 9\nevent: cancelled\ndata: {"type":"cancelled"}\n\n'
    )
  })
})
