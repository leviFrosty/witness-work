import { describe, it, expect } from 'vitest'
import {
  planImportsToStart,
  countRunning,
  clientImportCap,
  workingSubLabel,
  prepareNotesImportCommit,
  foldStreamEvent,
  classifyRunOutcome,
  classifyStartRun,
  buildQueueItems,
  approxTokens,
  REASONING_TAIL,
  decideCreditsUpdate,
  type QueuePlanItem,
} from '@/features/notes-import/lib/notesImportManagerLogic'
import type { MappedNotesImport } from '@/features/notes-import/lib/mapNotesImport'
import type { PreviewSelection } from '@/features/notes-import/lib/buildNotesImportPreview'
import type {
  ImportStreamEvent,
  NotesImportRunHandle,
} from '@/features/notes-import/lib/notesImportClient'

const item = (over: Partial<QueuePlanItem>): QueuePlanItem => ({
  hash: 'h',
  isWorking: true,
  isRunning: false,
  createdAt: 0,
  ...over,
})

describe('clientImportCap', () => {
  it('mirrors the proxy caps', () => {
    expect(clientImportCap(false)).toBe(2)
    expect(clientImportCap(true)).toBe(5)
  })
})

describe('planImportsToStart', () => {
  it('promotes the oldest queued imports up to the free slots', () => {
    const items = [
      item({ hash: 'a', createdAt: 3 }),
      item({ hash: 'b', createdAt: 1 }),
      item({ hash: 'c', createdAt: 2 }),
    ]
    expect(planImportsToStart(items, 2)).toEqual(['b', 'c']) // FIFO, 2 slots
  })

  it('counts running imports against the cap', () => {
    const items = [
      item({ hash: 'a', isRunning: true, createdAt: 1 }),
      item({ hash: 'b', createdAt: 2 }),
      item({ hash: 'c', createdAt: 3 }),
    ]
    expect(countRunning(items)).toBe(1)
    expect(planImportsToStart(items, 2)).toEqual(['b']) // 1 slot left
  })

  it('returns nothing when at capacity', () => {
    const items = [
      item({ hash: 'a', isRunning: true }),
      item({ hash: 'b', isRunning: true }),
      item({ hash: 'c' }),
    ]
    expect(planImportsToStart(items, 2)).toEqual([])
  })

  it('ignores Ready/Done rows (not Working) — they hold no slot', () => {
    const items = [
      item({ hash: 'ready', isWorking: false, createdAt: 1 }),
      item({ hash: 'queued', createdAt: 2 }),
    ]
    expect(planImportsToStart(items, 2)).toEqual(['queued'])
  })
})

describe('workingSubLabel', () => {
  it('distinguishes Running from Queued', () => {
    expect(workingSubLabel(true)).toBe('running')
    expect(workingSubLabel(false)).toBe('queued')
  })
})

describe('prepareNotesImportCommit', () => {
  const at = new Date('2026-06-01T12:00:00Z')
  const mapped: MappedNotesImport = {
    contacts: [{ id: 'notes-h-c-c1', name: 'Maria', createdAt: at }],
    visits: [
      {
        id: 'notes-h-v-v1',
        contact: { id: 'notes-h-c-c1' },
        date: at,
        isBibleStudy: false,
      },
    ],
    timeEntries: [],
    categories: [],
    customFieldDefs: [],
    publisher: null,
    warnings: [],
  }

  it('selects then reconciles: a deselected contact is dropped', () => {
    const selection: PreviewSelection = { ids: new Set(), publisher: false }
    const { mapped: out } = prepareNotesImportCommit(mapped, selection, {
      contacts: [],
      categories: [],
    })
    expect(out.contacts).toHaveLength(0)
    expect(out.visits).toHaveLength(0)
  })

  it('reconciles selected records onto current data and surfaces nothing when unique', () => {
    const selection: PreviewSelection = {
      ids: new Set(['notes-h-c-c1', 'notes-h-v-v1']),
      publisher: false,
    }
    const { mapped: out, warnings } = prepareNotesImportCommit(
      mapped,
      selection,
      {
        contacts: [{ id: 'existing-maria', name: 'maria' }],
        categories: [],
      }
    )
    expect(out.contacts).toHaveLength(0) // attached to existing, not inserted
    expect(out.visits[0].contact.id).toBe('existing-maria')
    expect(warnings).toHaveLength(0)
  })
})

describe('foldStreamEvent', () => {
  const rt = { reasoning: 'abc', chars: 10, tokens: 5 }

  it('maps a status event to the coarse phase only', () => {
    expect(
      foldStreamEvent(
        rt,
        { type: 'status', status: 'thinking' },
        {
          captureReasoning: false,
        }
      )
    ).toEqual({ phase: 'thinking' })
  })

  it('reasoning: token count always climbs but text is dropped without capture', () => {
    const ev: ImportStreamEvent = { type: 'reasoning', text: 'hello world!' } // 12 chars
    const patch = foldStreamEvent(rt, ev, { captureReasoning: false })
    expect(patch).toEqual({ tokens: 5 + approxTokens(12) }) // no `reasoning` key
    expect('reasoning' in patch).toBe(false)
  })

  it('reasoning: captures appended, tail-trimmed text when capture is on (dev)', () => {
    const ev: ImportStreamEvent = { type: 'reasoning', text: 'XYZ' }
    const patch = foldStreamEvent(rt, ev, { captureReasoning: true })
    expect(patch).toEqual({
      tokens: 5 + approxTokens(3),
      reasoning: 'abcXYZ',
    })
  })

  it('reasoning: trims the captured text to the REASONING_TAIL window', () => {
    const prev = { reasoning: 'a'.repeat(REASONING_TAIL), chars: 0, tokens: 0 }
    const ev: ImportStreamEvent = { type: 'reasoning', text: 'bbbb' }
    const patch = foldStreamEvent(prev, ev, { captureReasoning: true })
    expect(patch.reasoning).toHaveLength(REASONING_TAIL)
    expect(patch.reasoning?.endsWith('bbbb')).toBe(true)
    expect(patch.reasoning?.startsWith('a')).toBe(true)
  })

  it('progress: sets chars and rolls the positive delta into the token heartbeat', () => {
    const ev: ImportStreamEvent = { type: 'progress', chars: 30 }
    const patch = foldStreamEvent(rt, ev, { captureReasoning: false })
    expect(patch).toEqual({ chars: 30, tokens: 5 + approxTokens(20) }) // 30 - 10
  })

  it('progress: never subtracts tokens when chars regresses (max(0, delta))', () => {
    const ev: ImportStreamEvent = { type: 'progress', chars: 3 } // below prev.chars 10
    const patch = foldStreamEvent(rt, ev, { captureReasoning: false })
    expect(patch).toEqual({ chars: 3, tokens: 5 }) // delta clamped to 0
  })

  it('done/error fold to an empty patch (handled by the run promise)', () => {
    expect(
      foldStreamEvent(
        rt,
        { type: 'done', payload: {} as never },
        {
          captureReasoning: true,
        }
      )
    ).toEqual({})
    expect(
      foldStreamEvent(
        rt,
        { type: 'error', code: 'x', message: 'm' },
        {
          captureReasoning: true,
        }
      )
    ).toEqual({})
  })
})

describe('classifyRunOutcome', () => {
  const opts = { cooldownMs: 4_000 }

  it('an aborted run is a cancel (regardless of code)', () => {
    expect(
      classifyRunOutcome({ aborted: true, code: 'model_error' }, opts)
    ).toEqual({ kind: 'cancelled' })
  })

  it('active_cap backs off with the supplied cooldown', () => {
    expect(
      classifyRunOutcome({ aborted: false, code: 'active_cap' }, opts)
    ).toEqual({ kind: 'cooldown', cooldownMs: 4_000 })
  })

  it('unknown and model_error fail WITH a report (logged + Sentry)', () => {
    expect(
      classifyRunOutcome({ aborted: false, code: 'unknown' }, opts)
    ).toEqual({
      kind: 'failed',
      code: 'unknown',
      report: true,
      retryable: true,
    })
    expect(
      classifyRunOutcome({ aborted: false, code: 'model_error' }, opts)
    ).toEqual({
      kind: 'failed',
      code: 'model_error',
      report: true,
      retryable: true,
    })
  })

  it('other codes fail WITHOUT a report (surfaced only)', () => {
    expect(
      classifyRunOutcome({ aborted: false, code: 'too_large' }, opts)
    ).toEqual({
      kind: 'failed',
      code: 'too_large',
      report: false,
      retryable: true,
    })
  })

  it('keeps import and refinement allowance denials non-retryable', () => {
    expect(
      classifyRunOutcome({ aborted: false, code: 'limit_reached' }, opts)
    ).toEqual({
      kind: 'failed',
      code: 'limit_reached',
      report: false,
      retryable: false,
    })
    expect(
      classifyRunOutcome({ aborted: false, code: 'refinement_limit' }, opts)
    ).toEqual({
      kind: 'failed',
      code: 'refinement_limit',
      report: false,
      retryable: false,
    })
  })
})

describe('decideCreditsUpdate', () => {
  const authoritative = {
    remaining: 4,
    limit: 5,
    resetsAt: '2026-09-01T00:00:00.000Z',
    isSupporter: false,
    refinements: { remaining: 4, limit: 5 },
  }
  const kickoff = {
    remaining: 3,
    limit: 5,
    resetsAt: '2026-09-01T00:00:00.000Z',
    isSupporter: false,
    refinements: { remaining: 2, limit: 5 },
  }
  const now = Date.parse('2026-08-01T00:00:00.000Z')

  it('keeps kickoff display separate from persisted authority', () => {
    expect(
      decideCreditsUpdate({
        current: authoritative,
        currentProvenance: 'authoritative',
        authoritative,
        incoming: kickoff,
        source: 'kickoff',
        now,
      })
    ).toEqual({
      credits: kickoff,
      provenance: 'kickoff',
      authoritative,
      persist: false,
      refreshed: false,
    })
  })

  it.each(['terminal', 'denial'] as const)(
    'persists an authoritative %s snapshot',
    (source) => {
      expect(
        decideCreditsUpdate({
          current: authoritative,
          currentProvenance: 'authoritative',
          authoritative,
          incoming: kickoff,
          source,
          now,
        })
      ).toEqual({
        credits: kickoff,
        provenance: 'authoritative',
        authoritative: kickoff,
        persist: true,
        refreshed: false,
      })
    }
  )

  it.each(['terminal', 'denial'] as const)(
    'does not let a stale same-window %s increase remaining',
    (source) => {
      const current = {
        ...authoritative,
        remaining: 3,
        refinements: { remaining: 1, limit: 5 },
      }
      const stale = {
        ...authoritative,
        remaining: 4,
        refinements: { remaining: 2, limit: 5 },
      }

      expect(
        decideCreditsUpdate({
          current,
          currentProvenance: 'authoritative',
          authoritative: current,
          incoming: stale,
          source,
          now,
        })
      ).toEqual({
        credits: { ...stale, remaining: 3 },
        provenance: 'authoritative',
        authoritative: { ...stale, remaining: 3 },
        persist: true,
        refreshed: false,
      })
    }
  )

  it.each([
    [
      'window',
      { ...authoritative, remaining: 4, resetsAt: '2026-10-01T00:00:00.000Z' },
    ],
    ['config', { ...authoritative, remaining: 4, limit: 6 }],
    ['tier', { ...authoritative, remaining: 4, isSupporter: true }],
  ] as const)(
    'lets a changed %s replace remaining authoritatively',
    (_kind, incoming) => {
      const current = { ...authoritative, remaining: 3 }

      expect(
        decideCreditsUpdate({
          current,
          currentProvenance: 'authoritative',
          authoritative: current,
          incoming,
          source: 'terminal',
          now,
        })
      ).toEqual({
        credits: incoming,
        provenance: 'authoritative',
        authoritative: incoming,
        persist: true,
        refreshed: false,
      })
    }
  )

  it('preserves the prior valid state when an incoming snapshot is malformed', () => {
    expect(
      decideCreditsUpdate({
        current: authoritative,
        currentProvenance: 'authoritative',
        authoritative,
        incoming: { remaining: 2, isSupporter: false },
        source: 'terminal',
        now,
      })
    ).toEqual({
      credits: authoritative,
      provenance: 'authoritative',
      authoritative,
      persist: false,
      refreshed: false,
    })
  })

  it('keeps usage unavailable when there is no prior or valid incoming snapshot', () => {
    expect(
      decideCreditsUpdate({
        current: null,
        currentProvenance: null,
        authoritative: null,
        incoming: undefined,
        source: 'denial',
        now,
      })
    ).toEqual({
      credits: null,
      provenance: null,
      authoritative: null,
      persist: false,
      refreshed: false,
    })
  })

  it.each(['hydrate', 'focus', 'app-active'] as const)(
    'normalizes authority and replaces display-only kickoff state after expiry on %s',
    (source) => {
      expect(
        decideCreditsUpdate({
          current: kickoff,
          currentProvenance: 'kickoff',
          authoritative,
          incoming: undefined,
          source,
          now: Date.parse(authoritative.resetsAt),
        })
      ).toEqual({
        credits: { ...authoritative, remaining: 5, resetsAt: null },
        provenance: 'authoritative',
        authoritative: {
          ...authoritative,
          remaining: 5,
          resetsAt: null,
        },
        persist: true,
        refreshed: true,
      })
    }
  )

  it.each(['hydrate', 'focus', 'app-active'] as const)(
    'does not promote a future display-only kickoff snapshot on %s',
    (source) => {
      expect(
        decideCreditsUpdate({
          current: kickoff,
          currentProvenance: 'kickoff',
          authoritative,
          incoming: undefined,
          source,
          now,
        })
      ).toEqual({
        credits: kickoff,
        provenance: 'kickoff',
        authoritative,
        persist: false,
        refreshed: false,
      })
    }
  )
})

describe('classifyStartRun', () => {
  const run = { importId: 'i', subscribeToken: 't' } as NotesImportRunHandle

  it('reconnects when there is a live run', () => {
    expect(classifyStartRun({ activeRun: run, notesText: '' })).toBe(
      'reconnect'
    )
  })

  it('kicks off fresh when there is no run but there are notes', () => {
    expect(classifyStartRun({ activeRun: null, notesText: 'some notes' })).toBe(
      'kickoff'
    )
  })

  it('is bad_request when there is neither a run nor (non-blank) notes', () => {
    expect(classifyStartRun({ activeRun: null, notesText: '   ' })).toBe(
      'bad_request'
    )
    expect(classifyStartRun({ activeRun: null, notesText: '' })).toBe(
      'bad_request'
    )
  })
})

describe('buildQueueItems', () => {
  const entries = [
    { hash: 'a', state: 'working', createdAt: 1 },
    { hash: 'b', state: 'working', createdAt: 2 },
    { hash: 'c', state: 'ready', createdAt: 3 },
  ]
  const noRuntime = {
    getRuntime: () => undefined,
    isInFlight: () => false,
    cooldownUntil: () => 0,
    now: 1_000,
  }

  it('maps ledger state to isWorking and reflects the in-flight set', () => {
    const items = buildQueueItems(entries, {
      ...noRuntime,
      isInFlight: (h) => h === 'a',
    })
    expect(items).toEqual([
      { hash: 'a', isWorking: true, isRunning: true, createdAt: 1 },
      { hash: 'b', isWorking: true, isRunning: false, createdAt: 2 },
      { hash: 'c', isWorking: false, isRunning: false, createdAt: 3 },
    ])
  })

  it('excludes errored or paused Working rows from isWorking', () => {
    const items = buildQueueItems(entries, {
      ...noRuntime,
      getRuntime: (h) =>
        h === 'a'
          ? { error: 'model_error' }
          : h === 'b'
            ? { paused: true }
            : undefined,
    })
    expect(items.find((i) => i.hash === 'a')?.isWorking).toBe(false)
    expect(items.find((i) => i.hash === 'b')?.isWorking).toBe(false)
  })

  it('filters out rows still inside their cooldown window', () => {
    const items = buildQueueItems(entries, {
      ...noRuntime,
      cooldownUntil: (h) => (h === 'a' ? 2_000 : 0), // a still cooling at now=1000
    })
    expect(items.map((i) => i.hash)).toEqual(['b', 'c'])
  })

  it('keeps a row whose cooldown has elapsed (boundary: cooldown <= now)', () => {
    const items = buildQueueItems(entries, {
      ...noRuntime,
      cooldownUntil: (h) => (h === 'a' ? 1_000 : 0), // exactly now → included
    })
    expect(items.map((i) => i.hash)).toContain('a')
  })
})
