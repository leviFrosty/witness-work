import { describe, expect, it } from 'vitest'
import { createAccountOffer } from '@/app/web-sign-in/createAccountOffer'

describe('Create an Account on the sign-in screen', () => {
  it('offers sign-up in every build when the browser keeps no data', () => {
    for (const dev of [true, false])
      expect(
        createAccountOffer({ dev, keptData: false, withoutAccount: false })
      ).toEqual({ offered: true, open: false })
  })

  it('never offers sign-up while the browser keeps an account’s data', () => {
    expect(
      createAccountOffer({ dev: true, keptData: true, withoutAccount: true })
    ).toEqual({ offered: false, open: false })
  })

  it('opens the app without an account only for a dev build’s tests', () => {
    expect(
      createAccountOffer({ dev: false, keptData: false, withoutAccount: true })
    ).toEqual({ offered: true, open: false })
    expect(
      createAccountOffer({ dev: true, keptData: false, withoutAccount: true })
    ).toEqual({ offered: true, open: true })
  })
})
