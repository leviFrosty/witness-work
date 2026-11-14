import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBuddiesEnabled, type KillSwitchEnv } from './killSwitch'

const kv = (value: string | null | Error) =>
  ({
    get: vi.fn(async () => {
      if (value instanceof Error) throw value
      return value
    }),
  }) as unknown as KillSwitchEnv['NOTES_KV'] & { get: ReturnType<typeof vi.fn> }

afterEach(() => vi.restoreAllMocks())

describe('isBuddiesEnabled', () => {
  it('is enabled only when KV is "true", and reads KV with a 60 s edge cache', async () => {
    const store = kv('true')
    expect(
      await isBuddiesEnabled({ NOTES_KV: store, BUDDIES_ENABLED: 'false' })
    ).toBe(true)
    expect(store.get).toHaveBeenCalledWith('buddies:enabled', { cacheTtl: 60 })
    expect(await isBuddiesEnabled({ NOTES_KV: kv(' true\n') })).toBe(true)
    expect(
      await isBuddiesEnabled({ NOTES_KV: kv('false'), BUDDIES_ENABLED: 'true' })
    ).toBe(false)
    expect(
      await isBuddiesEnabled({ NOTES_KV: kv('1'), BUDDIES_ENABLED: 'true' })
    ).toBe(false)
  })

  it('falls back to BUDDIES_ENABLED when the key is absent or KV fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(
      await isBuddiesEnabled({ NOTES_KV: kv(null), BUDDIES_ENABLED: 'true' })
    ).toBe(true)
    expect(
      await isBuddiesEnabled({ NOTES_KV: kv(null), BUDDIES_ENABLED: 'false' })
    ).toBe(false)
    expect(await isBuddiesEnabled({ NOTES_KV: kv(null) })).toBe(false)
    expect(
      await isBuddiesEnabled({
        NOTES_KV: kv(new Error('kv down')),
        BUDDIES_ENABLED: 'true',
      })
    ).toBe(true)
  })
})
