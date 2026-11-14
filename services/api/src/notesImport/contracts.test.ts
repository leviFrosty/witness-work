import { describe, expect, it } from 'vitest'
import { buildAllowanceDenial } from './contracts'
import type { CreditsSnapshot } from '../credits'

const credits: CreditsSnapshot = {
  remaining: 0,
  limit: 5,
  resetsAt: '2026-07-31T00:00:00.000Z',
  isSupporter: false,
  refinements: { remaining: null, limit: null },
}

describe('structured allowance denials', () => {
  it('keeps limit_reached HTTP behavior and includes the complete snapshot', () => {
    expect(buildAllowanceDenial('limit_reached', credits)).toEqual({
      status: 402,
      body: {
        error: 'Import allowance reached',
        code: 'limit_reached',
        credits,
      },
    })
  })

  it('keeps refinement_limit HTTP behavior and includes the complete snapshot', () => {
    expect(buildAllowanceDenial('refinement_limit', credits)).toEqual({
      status: 429,
      body: {
        error: 'Refinement limit reached for this import',
        code: 'refinement_limit',
        credits,
      },
    })
  })
})
