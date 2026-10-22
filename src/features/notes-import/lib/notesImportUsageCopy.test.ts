import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const i18n = new I18n({ 'en-us': enUS })
  i18n.locale = 'en-us'
  return { default: i18n }
})

import {
  type NotesImportCredits,
  notesImportUsageView,
} from '@/features/notes-import/lib/notesImportUsage'
import {
  notesImportUsageBody,
  notesImportUsageLabels,
} from '@/features/notes-import/lib/notesImportUsageCopy'

const schedule = {
  imports: { free: 3, supporter: null },
  refinements: { free: 5, supporter: null },
  windowDays: 30,
}

const credits = (patch: Partial<NotesImportCredits>): NotesImportCredits => ({
  remaining: 2,
  limit: 3,
  resetsAt: null,
  isSupporter: false,
  refinements: { remaining: 5, limit: 5 },
  ...patch,
})

/** The trigger, balance and body the control shows. */
const copy = (input: Parameters<typeof notesImportUsageView>[0]) => {
  const { view, isSupporter } = notesImportUsageView(input)
  return {
    ...notesImportUsageLabels(view),
    body: notesImportUsageBody(view, isSupporter),
  }
}

const upsell = /become a supporter/i

describe('Notes Import usage copy', () => {
  it('thanks a Supporter with unlimited imports instead of selling Supporter', () => {
    const shown = copy({
      credits: credits({ remaining: null, limit: null, isSupporter: true }),
      schedule,
      supporter: false,
    })
    expect(shown).toEqual({
      trigger: 'Unlimited',
      balance: 'Unlimited imports',
      body: 'As a Supporter, your Scribe AI imports are unlimited. Thank you for supporting WitnessWork!',
    })
  })

  it('explains credits to a Supporter whose allowance is finite, without the upsell', () => {
    const shown = copy({
      credits: credits({ remaining: 8, limit: 10, isSupporter: true }),
      schedule,
      supporter: true,
    })
    expect(shown.trigger).toBe('8 left')
    expect(shown.body).toBe('New notes use 1 credit.')
  })

  it('still offers Supporter to everyone else, unlimited development usage included', () => {
    expect(
      copy({ credits: credits({}), schedule, supporter: true }).body
    ).toMatch(upsell)
    expect(
      copy({
        credits: credits({ remaining: null, limit: null }),
        schedule,
        supporter: false,
      }).body
    ).toMatch(upsell)
  })

  it('takes the server’s answer over this device’s entitlement once it has one', () => {
    expect(
      notesImportUsageView({ credits: credits({}), schedule, supporter: true })
        .isSupporter
    ).toBe(false)
  })

  describe('before the first import', () => {
    it('shows a Supporter’s unlimited allowance from the schedule', () => {
      expect(copy({ credits: null, schedule, supporter: true })).toEqual({
        trigger: 'Unlimited',
        balance: 'Unlimited imports',
        body: 'As a Supporter, your Scribe AI imports are unlimited. Thank you for supporting WitnessWork!',
      })
    })

    it('shows the free allowance, not a made-up balance', () => {
      expect(copy({ credits: null, schedule, supporter: false })).toEqual({
        trigger: 'Up to 3',
        balance: '3 / 30-day window',
        body: expect.stringMatching(upsell),
      })
    })

    it('says no imports are included when the allowance is zero', () => {
      const shown = copy({
        credits: null,
        schedule: { ...schedule, imports: { free: 0, supporter: 0 } },
        supporter: false,
      })
      expect(shown.balance).toBe('No imports included')
      expect(shown.trigger).toBe('0 left')
    })

    it('falls back to unavailable only without the schedule', () => {
      expect(
        copy({ credits: null, schedule: null, supporter: false })
      ).toMatchObject({
        trigger: '— left',
        balance: 'Usage unavailable',
      })
    })
  })
})
