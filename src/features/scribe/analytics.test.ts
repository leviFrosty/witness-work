import { beforeEach, describe, expect, it, vi } from 'vitest'

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture } }))

import {
  trackCaptureFinished,
  trackProposalResolved,
  trackTurnFinished,
  trackTurnStarted,
  turnBucket,
  turnDurationBucket,
  voiceDurationBucket,
} from '@/features/scribe/analytics'
import { scribeAnalyticsEventNames } from '@/lib/scribeAnalyticsEvents'
import { analyticsEventNames } from '@/lib/analyticsEvents'

beforeEach(() => capture.mockClear())

describe('Scribe AI analytics', () => {
  it('registers every event it sends', () => {
    expect(analyticsEventNames).toEqual(
      expect.arrayContaining([...scribeAnalyticsEventNames])
    )
  })

  it('buckets turns, durations and recordings', () => {
    expect([1, 2, 3, 5, 6, 40].map(turnBucket)).toEqual([
      '1',
      '2',
      '3-5',
      '3-5',
      '6+',
      '6+',
    ])
    expect([4_999, 5_000, 29_999, 30_000].map(turnDurationBucket)).toEqual([
      '<5s',
      '5-15s',
      '15-30s',
      '30s+',
    ])
    expect([14_999, 59_999, 119_999, 120_000].map(voiceDurationBucket)).toEqual(
      ['<15s', '15-60s', '1-2m', '2m+']
    )
  })

  it('sends structure only', () => {
    trackTurnStarted({
      entry: 'home_orb',
      input: 'voice',
      turn: 1,
      pendingProposal: false,
    })
    trackTurnFinished({
      outcome: 'proposal',
      steps: 2,
      readCalls: 1,
      writeCalls: 2,
      invalidCalls: 0,
      errorCode: null,
      durationMs: 7_000,
    })
    trackProposalResolved({
      outcome: 'applied',
      cards: 2,
      appliedCards: 2,
      deselectedCards: 0,
      choiceCards: 1,
      kinds: ['visit.create', 'contact.create', 'visit.create'],
      tainted: false,
    })
    trackCaptureFinished({
      input: 'voice',
      outcome: 'cap',
      durationMs: 180_000,
      engine: 'speechTranscriber',
    })
    trackCaptureFinished({ input: 'paper', outcome: 'done', pages: 3 })
    expect(capture.mock.calls).toEqual([
      [
        'scribe_turn_started',
        {
          entry: 'home_orb',
          input: 'voice',
          turn: '1',
          pending_proposal: false,
        },
      ],
      [
        'scribe_turn_finished',
        {
          outcome: 'proposal',
          steps: 2,
          read_calls: 1,
          write_calls: 2,
          invalid_calls: 0,
          error_code: null,
          duration: '5-15s',
        },
      ],
      [
        'scribe_proposal_resolved',
        {
          outcome: 'applied',
          cards: 2,
          applied_cards: 2,
          deselected_cards: 0,
          choice_cards: 1,
          kinds: 'contact.create,visit.create',
          tainted: false,
        },
      ],
      [
        'scribe_capture_finished',
        {
          input: 'voice',
          outcome: 'cap',
          duration: '2m+',
          error_code: null,
          engine: 'speechTranscriber',
        },
      ],
      [
        'scribe_capture_finished',
        { input: 'paper', outcome: 'done', pages: 3, error_code: null },
      ],
    ])
  })
})
