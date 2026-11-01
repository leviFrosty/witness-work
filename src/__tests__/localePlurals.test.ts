import { describe, it, expect } from 'vitest'
import { I18n } from 'i18n-js'
import enUS from '@/locales/en-US.json'

describe('en-US plural keys', () => {
  it('uses { one, other } objects, not i18next suffixes', () => {
    const suffixed = Object.keys(enUS).filter((key) =>
      /_(zero|one|two|few|many|other)$/.test(key)
    )
    expect(suffixed).toEqual([])
  })

  it.each([
    ['routePlan_error_rateLimitedSeconds', 'in 1 second.', 'in 2 seconds.'],
    ['routePlan_error_rateLimitedMinutes', 'in 1 minute.', 'in 2 minutes.'],
    ['contactsMissingCoordinates', '1 contact is', '2 contacts are'],
    ['avatarGroup_moreCount', '1 more person', '2 more people'],
    ['daysLeftCount', '1 day left', '2 days left'],
    ['goalHoursSuffix', '/ 1 hour', '/ 2 hours'],
  ])('%s picks the singular for 1', (key, one, other) => {
    const i18n = new I18n({ en: enUS })
    i18n.locale = 'en'
    expect(i18n.t(key, { count: 1 })).toContain(one)
    expect(i18n.t(key, { count: 2 })).toContain(other)
  })
})
