import { describe, expect, it } from 'vitest'
import {
  allowanceDeniedEvent,
  usageResetEvent,
  windowRolledOverEvent,
} from './operations'

describe('privacy-safe Notes Import operational events', () => {
  it('describes an allowance denial using only the opaque DO id and meter facts', () => {
    expect(
      allowanceDeniedEvent({
        objectId: 'opaque-object',
        kind: 'import',
        isSupporter: false,
        used: 5,
        limit: 5,
        resetsAt: '2026-07-31T00:00:00.000Z',
      })
    ).toEqual({
      event: 'notes_import_allowance_denied',
      objectId: 'opaque-object',
      kind: 'import',
      isSupporter: false,
      used: 5,
      limit: 5,
      resetsAt: '2026-07-31T00:00:00.000Z',
    })
  })

  it('describes lazy rollover without content-derived identifiers', () => {
    expect(
      windowRolledOverEvent({
        objectId: 'opaque-object',
        isSupporter: true,
        previousUsed: 3,
        previousLimit: 4,
        previousResetsAt: '2026-07-31T00:00:00.000Z',
        newResetsAt: '2026-08-30T00:00:00.000Z',
      })
    ).toEqual({
      event: 'notes_import_window_rolled_over',
      objectId: 'opaque-object',
      isSupporter: true,
      previousUsed: 3,
      previousLimit: 4,
      previousResetsAt: '2026-07-31T00:00:00.000Z',
      newResetsAt: '2026-08-30T00:00:00.000Z',
    })
  })

  it('describes a successful reset without its raw meter identity', () => {
    const event = usageResetEvent({
      objectId: 'opaque-object',
      previousUsed: 4,
      hadActiveWindow: true,
      deletedEmptyRuns: 2,
    })
    expect(event).toEqual({
      event: 'notes_import_usage_reset',
      objectId: 'opaque-object',
      previousUsed: 4,
      hadActiveWindow: true,
      deletedEmptyRuns: 2,
    })
    expect(Object.keys(event)).not.toEqual(
      expect.arrayContaining(['meterId', 'contentHash', 'importId', 'notesText'])
    )
  })
})
