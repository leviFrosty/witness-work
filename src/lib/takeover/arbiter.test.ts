import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  type ArbiterState,
  holdTakeovers,
  initialArbiterState,
  nextTakeoverWake,
  releaseTakeover,
  requestTakeover,
  seedTakeover,
  settleTakeovers,
  TAKEOVER_KINDS,
  type TakeoverClaim,
  type TakeoverKind,
  unholdTakeovers,
} from '@/lib/takeover/arbiter'

const config = { gapMs: 700 }
const PRIORITY: Record<TakeoverKind, number> = {
  'update-reveal': 10,
  'milestone-reveal': 11,
  'whats-new': 20,
  'schedule-intro': 30,
  'streak-celebration': 40,
  'badge-celebration': 41,
  'badges-welcome': 50,
  'badges-history': 51,
}

const claim = (
  id: string,
  kind: TakeoverKind,
  at: number,
  extra: Partial<TakeoverClaim> = {}
): TakeoverClaim => ({
  id,
  kind,
  priority: PRIORITY[kind],
  requestedAt: at,
  ...extra,
})

const request = (
  state: ArbiterState,
  id: string,
  kind: TakeoverKind,
  at: number,
  extra: Partial<TakeoverClaim> = {}
) => requestTakeover(state, claim(id, kind, at, extra), at, config)

const start = initialArbiterState()

describe('takeover arbiter', () => {
  it('grants a claim at once when the screen is free', () => {
    const state = request(start, 'a', 'badge-celebration', 1000)
    expect(state.active?.id).toBe('a')
    expect(state.queue).toEqual([])
    expect(state.shown).toEqual(['badge-celebration'])
  })

  it('never interrupts the takeover on screen', () => {
    let state = request(start, 'welcome', 'badges-welcome', 1000)
    state = request(state, 'reveal', 'update-reveal', 1100)
    expect(state.active?.id).toBe('welcome')
    expect(state.queue.map((c) => c.id)).toEqual(['reveal'])
  })

  it('leaves a gap after a release, then grants by priority', () => {
    let state = request(start, 'intro', 'schedule-intro', 0)
    state = request(state, 'summary', 'badges-history', 10)
    state = request(state, 'streak', 'streak-celebration', 20)
    state = releaseTakeover(state, 'intro', 1000, config)
    expect(state.active).toBeNull()
    expect(nextTakeoverWake(state, 1000, config)).toBe(1700)
    expect(settleTakeovers(state, 1699, config).active).toBeNull()
    state = settleTakeovers(state, 1700, config)
    expect(state.active?.id).toBe('streak')
  })

  it('keeps requests of equal priority in arrival order', () => {
    let state = request(start, 'busy', 'update-reveal', 0)
    state = request(state, 'first', 'badges-welcome', 5)
    state = request(state, 'second', 'badges-welcome', 6)
    // Asking again keeps the original place in line.
    state = request(state, 'first', 'badges-welcome', 50)
    state = releaseTakeover(state, 'busy', 100, config)
    state = settleTakeovers(state, 800, config)
    expect(state.active?.id).toBe('first')
  })

  it('grants nothing new while held, and waits a gap after the last hold', () => {
    let state = holdTakeovers(start, 'profile', 0, config)
    state = holdTakeovers(state, 'sheet:1', 0, config)
    state = request(state, 'badge', 'badge-celebration', 10)
    expect(state.active).toBeNull()
    state = unholdTakeovers(state, 'profile', 500, config)
    expect(state.active).toBeNull()
    state = unholdTakeovers(state, 'sheet:1', 600, config)
    expect(state.active).toBeNull()
    expect(nextTakeoverWake(state, 600, config)).toBe(1300)
    expect(settleTakeovers(state, 1300, config).active?.id).toBe('badge')
  })

  it('lets a takeover the User asked for through a hold', () => {
    let state = holdTakeovers(start, 'screen', 0, config)
    state = request(state, 'replay', 'update-reveal', 10, {
      ignoresHolds: true,
    })
    expect(state.active?.id).toBe('replay')
  })

  it('expires a claim whose moment passes unshown', () => {
    let state = holdTakeovers(start, 'profile', 0, config)
    state = request(state, 'badge', 'badge-celebration', 0, {
      expiresAt: 15_000,
    })
    expect(nextTakeoverWake(state, 0, config)).toBe(15_000)
    state = settleTakeovers(state, 15_000, config)
    expect(state.queue).toEqual([])
    expect(state.expired).toEqual(['badge'])
    // Releasing it (the requester letting go) forgets the expiry.
    state = releaseTakeover(state, 'badge', 15_001, config)
    expect(state.expired).toEqual([])
  })

  it('expires celebrations when the app goes to the background', () => {
    let state = holdTakeovers(start, 'screen', 0, config)
    state = request(state, 'badge', 'badge-celebration', 0, {
      expiresOnHold: ['background'],
    })
    state = request(state, 'welcome', 'badges-welcome', 0)
    state = holdTakeovers(state, 'background', 10, config)
    expect(state.expired).toEqual(['badge'])
    expect(state.queue.map((c) => c.id)).toEqual(['welcome'])
    // Asked for while already in the background: refused at once.
    state = request(state, 'late', 'streak-celebration', 20, {
      expiresOnHold: ['background'],
    })
    expect(state.expired).toContain('late')
  })

  it('grants one celebration per action and quiets the rest', () => {
    let state = holdTakeovers(start, 'screen', 0, config)
    state = request(state, 'badge', 'badge-celebration', 0, {
      group: 'action:1',
    })
    state = request(state, 'streak', 'streak-celebration', 5, {
      group: 'action:1',
    })
    state = unholdTakeovers(state, 'screen', 100, config)
    state = settleTakeovers(state, 800, config)
    expect(state.active?.id).toBe('streak')
    expect(state.expired).toEqual(['badge'])
    // A later claim for the same action is refused; another action's isn't.
    state = request(state, 'again', 'badge-celebration', 900, {
      group: 'action:1',
    })
    expect(state.expired).toContain('again')
    state = request(state, 'next', 'badge-celebration', 900, {
      group: 'action:2',
    })
    expect(state.queue.map((c) => c.id)).toEqual(['next'])
  })

  it('seeds the launch reveal on screen, ahead of holds and the gap', () => {
    let state = holdTakeovers(start, 'screen', 0, config)
    state = seedTakeover(state, claim('reveal', 'update-reveal', 0), 0, config)
    expect(state.active?.id).toBe('reveal')
    state = request(state, 'badge', 'badge-celebration', 10)
    expect(state.active?.id).toBe('reveal')
    expect(state.shown).toEqual(['update-reveal'])
  })

  it('times out a stuck self-closing takeover', () => {
    let state = request(start, 'streak', 'streak-celebration', 0, {
      maxActiveMs: 15_000,
    })
    expect(nextTakeoverWake(state, 0, config)).toBe(15_000)
    state = settleTakeovers(state, 15_000, config)
    expect(state.active).toBeNull()
    expect(state.expired).toEqual(['streak'])
  })

  it('withdraws a waiting claim on release', () => {
    let state = request(start, 'busy', 'update-reveal', 0)
    state = request(state, 'intro', 'schedule-intro', 0)
    state = releaseTakeover(state, 'intro', 10, config)
    expect(state.queue).toEqual([])
    expect(state.active?.id).toBe('busy')
  })
})

/**
 * A seeded random walk over requests, releases, holds and time. Whatever the
 * order: never two takeovers at once or one replacing another, nothing new
 * granted while held (unless the User asked for it), the gap respected, the
 * highest-priority eligible claim first, one grant per group, and nothing left
 * waiting forever once holds lift and takeovers close.
 */
describe('takeover arbiter properties', () => {
  type Op =
    | {
        type: 'request'
        id: number
        kind: TakeoverKind
        expiresIn: number | null
        dropOnBackground: boolean
        ignoresHolds: boolean
        group: number | null
        maxActive: boolean
      }
    | { type: 'seed'; id: number }
    | { type: 'release'; id: number }
    | { type: 'releaseActive' }
    | { type: 'hold'; reason: string }
    | { type: 'unhold'; reason: string }
    | { type: 'tick'; ms: number }

  const reasons = ['screen', 'profile', 'tray', 'background', 'sheet:1']
  const op: fc.Arbitrary<Op> = fc.oneof(
    {
      weight: 5,
      arbitrary: fc.record({
        type: fc.constant('request' as const),
        id: fc.integer({ min: 0, max: 12 }),
        kind: fc.constantFrom(...TAKEOVER_KINDS),
        expiresIn: fc.option(fc.integer({ min: 0, max: 20_000 })),
        dropOnBackground: fc.boolean(),
        ignoresHolds: fc.boolean(),
        group: fc.option(fc.integer({ min: 0, max: 3 })),
        maxActive: fc.boolean(),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        type: fc.constant('seed' as const),
        id: fc.integer({ min: 0, max: 12 }),
      }),
    },
    {
      weight: 2,
      arbitrary: fc.record({
        type: fc.constant('release' as const),
        id: fc.integer({ min: 0, max: 12 }),
      }),
    },
    { weight: 3, arbitrary: fc.constant({ type: 'releaseActive' as const }) },
    {
      weight: 2,
      arbitrary: fc.record({
        type: fc.constant('hold' as const),
        reason: fc.constantFrom(...reasons),
      }),
    },
    {
      weight: 2,
      arbitrary: fc.record({
        type: fc.constant('unhold' as const),
        reason: fc.constantFrom(...reasons),
      }),
    },
    {
      weight: 4,
      arbitrary: fc.record({
        type: fc.constant('tick' as const),
        ms: fc.integer({ min: 0, max: 5_000 }),
      }),
    }
  )

  const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : 20261008

  it('holds every rule over random sequences', () => {
    fc.assert(
      fc.property(fc.array(op, { maxLength: 80 }), (ops) => {
        let state = initialArbiterState()
        let now = 1_000_000
        const granted = new Set<string>()
        const groupGrants = new Map<string, string>()

        const step = (next: ArbiterState, seeded: boolean) => {
          const before = state
          // Never replaced: an active takeover only ends by going null.
          if (before.active && next.active)
            expect(next.active.id).toBe(before.active.id)
          const fresh =
            next.active && next.active.id !== before.active?.id
              ? next.active
              : null
          if (fresh) {
            if (!seeded) {
              // Nothing new while held, unless the User asked.
              if (!fresh.ignoresHolds) expect(next.holds).toEqual([])
              // The gap after the screen last came free.
              if (next.clearedAt !== null)
                expect(now - next.clearedAt).toBeGreaterThanOrEqual(
                  config.gapMs
                )
              // Highest priority among the eligible ones.
              for (const other of next.queue)
                if (other.ignoresHolds || next.holds.length === 0)
                  expect(fresh.priority).toBeLessThanOrEqual(other.priority)
            }
            if (fresh.group) {
              expect(groupGrants.has(fresh.group)).toBe(false)
              groupGrants.set(fresh.group, fresh.id)
            }
            granted.add(fresh.id)
          }
          // A group that had its grant never has a claim still waiting.
          for (const queued of next.queue)
            if (queued.group) expect(next.groups).not.toContain(queued.group)
          // At most one entry per id, and never both waiting and on screen.
          const ids = next.queue.map((c) => c.id)
          expect(new Set(ids).size).toBe(ids.length)
          if (next.active) expect(ids).not.toContain(next.active.id)
          state = next
        }

        for (const o of ops) {
          switch (o.type) {
            case 'request':
              step(
                requestTakeover(
                  state,
                  {
                    id: `c${o.id}`,
                    kind: o.kind,
                    priority: PRIORITY[o.kind],
                    requestedAt: now,
                    ...(o.expiresIn !== null
                      ? { expiresAt: now + o.expiresIn }
                      : {}),
                    ...(o.dropOnBackground
                      ? { expiresOnHold: ['background'] }
                      : {}),
                    ...(o.ignoresHolds ? { ignoresHolds: true } : {}),
                    ...(o.group !== null ? { group: `g${o.group}` } : {}),
                    ...(o.maxActive ? { maxActiveMs: 15_000 } : {}),
                  },
                  now,
                  config
                ),
                false
              )
              break
            case 'seed':
              step(
                seedTakeover(
                  state,
                  claim(`c${o.id}`, 'update-reveal', now),
                  now,
                  config
                ),
                true
              )
              break
            case 'release':
              step(releaseTakeover(state, `c${o.id}`, now, config), false)
              break
            case 'releaseActive':
              if (state.active)
                step(
                  releaseTakeover(state, state.active.id, now, config),
                  false
                )
              break
            case 'hold':
              step(holdTakeovers(state, o.reason, now, config), false)
              break
            case 'unhold':
              step(unholdTakeovers(state, o.reason, now, config), false)
              break
            case 'tick': {
              // Time passes the way the store's timer delivers it: at every
              // wake on the way.
              const until = now + o.ms
              for (;;) {
                const wake = nextTakeoverWake(state, now, config)
                if (wake === null || wake > until) break
                now = Math.max(now, wake)
                step(settleTakeovers(state, now, config), false)
              }
              now = until
              step(settleTakeovers(state, now, config), false)
              break
            }
          }
        }

        // Nothing stuck: once every hold lifts and each takeover closes,
        // every waiting claim is shown or expires.
        for (const reason of [...state.holds])
          step(unholdTakeovers(state, reason, now, config), false)
        for (let guard = 0; guard < 200; guard++) {
          if (!state.active && state.queue.length === 0) break
          if (state.active) {
            now += 10
            step(releaseTakeover(state, state.active.id, now, config), false)
          } else {
            const wake = nextTakeoverWake(state, now, config)
            expect(wake).not.toBeNull()
            now = Math.max(now, wake ?? now)
            step(settleTakeovers(state, now, config), false)
          }
        }
        expect(state.active).toBeNull()
        expect(state.queue).toEqual([])
      }),
      { seed, numRuns: 400 }
    )
  })
})
