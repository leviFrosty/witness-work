import { describe, expect, it } from 'vitest'
import {
  buildHourglassLink,
  buildNwPublisherLink,
} from '@/features/service-reports/lib/submitLinks'

/**
 * Formats validated against the examples provided by each app's support team:
 *
 * NW Publisher:
 * https://nwpublisher.com/report/sharedInMinistry=true:hours=50:bibleStudies=8:credit=17:remarks=bethel+work
 *
 * Hourglass:
 * https://app.hourglass-app.com/report/submit?month=<m>&year=<y>&minutes=<min>[&studies=][&remarks=]
 */
describe('buildNwPublisherLink', () => {
  it('matches the exact example format from NW Publisher support', () => {
    expect(
      buildNwPublisherLink({
        sharedInMinistry: true,
        hours: 50,
        bibleStudies: 8,
        credit: 17,
        remarks: 'bethel work',
      })
    ).toBe(
      'https://nwpublisher.com/report/sharedInMinistry=true:hours=50:bibleStudies=8:credit=17:remarks=bethel+work'
    )
  })

  it('always includes the sharedInMinistry bool, even when false', () => {
    expect(buildNwPublisherLink({ sharedInMinistry: false })).toBe(
      'https://nwpublisher.com/report/sharedInMinistry=false'
    )
  })

  it('omits variables that are zero, null, or undefined instead of sending 0', () => {
    expect(
      buildNwPublisherLink({
        sharedInMinistry: true,
        hours: 0,
        credit: 0,
        bibleStudies: null,
        remarks: '',
      })
    ).toBe('https://nwpublisher.com/report/sharedInMinistry=true')
  })

  it('supports decimal hours', () => {
    expect(buildNwPublisherLink({ sharedInMinistry: true, hours: 12.5 })).toBe(
      'https://nwpublisher.com/report/sharedInMinistry=true:hours=12.5'
    )
  })

  it('replaces spaces in remarks with + and strips colons', () => {
    const link = buildNwPublisherLink({
      sharedInMinistry: true,
      remarks: 'LDC: 5 hours',
    })
    expect(link).toBe(
      'https://nwpublisher.com/report/sharedInMinistry=true:remarks=LDC-+5+hours'
    )
    // Colons only ever appear as the pair delimiter.
    const afterPath = link.replace('https://nwpublisher.com/report/', '')
    for (const pair of afterPath.split(':')) {
      expect(pair).toMatch(/^[a-zA-Z]+=[^:]*$/)
    }
  })

  it('converts multi-line remarks into +-separated words', () => {
    expect(
      buildNwPublisherLink({
        sharedInMinistry: true,
        remarks: 'line one\nline two',
      })
    ).toBe(
      'https://nwpublisher.com/report/sharedInMinistry=true:remarks=line+one+line+two'
    )
  })
})

describe('buildHourglassLink', () => {
  it('includes the required month, year, and minutes query params', () => {
    expect(buildHourglassLink({ month: 8, year: 2026, minutes: 3000 })).toBe(
      'https://app.hourglass-app.com/report/submit?month=8&year=2026&minutes=3000'
    )
  })

  it('appends optional studies and url-encoded remarks', () => {
    expect(
      buildHourglassLink({
        month: 1,
        year: 2026,
        minutes: 1,
        studies: 4,
        remarks: 'Credit overage in the amount of 5 hours.',
      })
    ).toBe(
      'https://app.hourglass-app.com/report/submit?month=1&year=2026&minutes=1&studies=4&remarks=Credit%20overage%20in%20the%20amount%20of%205%20hours.'
    )
  })

  it('omits studies when zero or null', () => {
    expect(
      buildHourglassLink({ month: 12, year: 2025, minutes: 600, studies: 0 })
    ).toBe(
      'https://app.hourglass-app.com/report/submit?month=12&year=2025&minutes=600'
    )
    expect(
      buildHourglassLink({ month: 12, year: 2025, minutes: 600, studies: null })
    ).toBe(
      'https://app.hourglass-app.com/report/submit?month=12&year=2025&minutes=600'
    )
  })

  it('sends minutes=0 for a checkbox publisher who did not share', () => {
    expect(buildHourglassLink({ month: 3, year: 2026, minutes: 0 })).toBe(
      'https://app.hourglass-app.com/report/submit?month=3&year=2026&minutes=0'
    )
  })
})
