import type { parsePhoneNumber as ParsePhoneNumber } from 'awesome-phonenumber'

export const parsePhoneNumber: typeof ParsePhoneNumber = (...args) =>
  (
    require('awesome-phonenumber') as typeof import('awesome-phonenumber')
  ).parsePhoneNumber(...args)
