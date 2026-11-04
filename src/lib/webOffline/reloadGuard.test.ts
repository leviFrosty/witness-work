import { describe, expect, it } from 'vitest'
import {
  allowReload,
  RELOAD_WINDOW_MS,
  type ReloadGuardEnv,
} from '@/lib/webOffline/reloadGuard'

function guard(build = 'index-aaa.js', start = 1_000_000) {
  let stored: string | null = null
  let now = start
  let current = build
  const env: ReloadGuardEnv = {
    read: () => stored,
    write: (value) => {
      stored = value
    },
    now: () => now,
    build: () => current,
  }
  return {
    env,
    stored: () => stored,
    advance: (ms: number) => {
      now += ms
    },
    setBuild: (value: string) => {
      current = value
    },
    seed: (value: string | null) => {
      stored = value
    },
  }
}

describe('allowReload', () => {
  it('lets a build reload once, and not again', () => {
    const g = guard()
    expect(allowReload(g.env)).toBe(true)
    expect(allowReload(g.env)).toBe(false)
    g.advance(60_000)
    expect(allowReload(g.env)).toBe(false)
  })

  it('lets the next build reload: the first reload worked', () => {
    const g = guard('index-old.js')
    expect(allowReload(g.env)).toBe(true)
    g.setBuild('index-new.js')
    expect(allowReload(g.env)).toBe(true)
    expect(allowReload(g.env)).toBe(false)
  })

  it('lets a tab that stayed open for a long time reload again', () => {
    const g = guard()
    expect(allowReload(g.env)).toBe(true)
    g.advance(RELOAD_WINDOW_MS + 1)
    expect(allowReload(g.env)).toBe(true)
  })

  it('treats a record from the future or a damaged one as no record', () => {
    const g = guard()
    g.seed(JSON.stringify({ build: 'index-aaa.js', at: 2_000_000 }))
    expect(allowReload(g.env)).toBe(true)
    for (const damaged of ['{', 'null', '"x"', '{"build":1,"at":"x"}']) {
      g.seed(damaged)
      expect(allowReload(g.env)).toBe(true)
    }
  })

  it('records the build and the time', () => {
    const g = guard('index-aaa.js', 42)
    allowReload(g.env)
    expect(JSON.parse(g.stored() ?? '')).toEqual({
      build: 'index-aaa.js',
      at: 42,
    })
  })
})
