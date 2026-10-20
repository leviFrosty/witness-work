import type { parsePhoneNumber as ParsePhoneNumber } from 'awesome-phonenumber'

/**
 * `awesome-phonenumber`'s `parsePhoneNumber`, required on first use. The
 * library and its metadata are one large module, so launch doesn't evaluate it
 * unless the first screen shows a phone number.
 */
export const parsePhoneNumber: typeof ParsePhoneNumber = (...args) =>
  (
    require('awesome-phonenumber') as typeof import('awesome-phonenumber')
  ).parsePhoneNumber(...args)
