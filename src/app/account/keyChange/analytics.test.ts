import { describe, expect, it } from 'vitest'
import {
  createKeyChangeEventGate,
  KEY_CHANGE_EVENT_INTERVAL_MS,
} from './analytics'

function setup() {
  const stored = new Map<string, number>()
  const clock = { now: 1_000_000 }
  const gate = createKeyChangeEventGate({
    get: (key) => stored.get(key) ?? null,
    set: (key, at) => void stored.set(key, at),
    now: () => clock.now,
  })
  return { gate, clock }
}

describe('key change events', () => {
  it('always sends a start and a completion', () => {
    const { gate } = setup()
    for (let i = 0; i < 3; i++) {
      expect(gate('account_key_change_started')).toBe(true)
      expect(gate('account_key_change_completed')).toBe(true)
    }
  })

  it('sends a step that keeps failing once a day, per event and stage', () => {
    const { gate, clock } = setup()
    expect(gate('account_key_change_failed', 'stored')).toBe(true)
    expect(gate('account_key_change_failed', 'stored')).toBe(false)
    expect(gate('account_key_change_resumed', 'stored')).toBe(true)
    expect(gate('account_key_change_failed', 'resealed')).toBe(true)
    clock.now += KEY_CHANGE_EVENT_INTERVAL_MS
    expect(gate('account_key_change_failed', 'stored')).toBe(true)
  })
})
