import { describe, expect, it } from 'vitest'
import { parsePhoneNumber as parseDirect } from 'awesome-phonenumber'
import { parsePhoneNumber } from '@/lib/parsePhoneNumber'

describe('parsePhoneNumber', () => {
  it('parses like awesome-phonenumber', () => {
    for (const [phone, regionCode] of [
      ['(415) 555-1000', 'US'],
      ['+44 20 7946 0958', ''],
      ['030 1234567', 'DE'],
      ['not a number', 'US'],
    ]) {
      expect(parsePhoneNumber(phone, { regionCode })).toEqual(
        parseDirect(phone, { regionCode })
      )
    }
  })

  it('formats a valid number as E.164', () => {
    const parsed = parsePhoneNumber('(415) 555-1000', { regionCode: 'US' })
    expect(parsed.valid).toBe(true)
    expect(parsed.number?.e164).toBe('+14155551000')
  })
})
