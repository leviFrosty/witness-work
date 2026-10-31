import { describe, expect, it } from 'vitest'
import { createAccountOffer } from '@/app/web-sign-in/createAccountOffer'

describe('Create an Account before web sign-up', () => {
  it('offers no way into the app without an account in a production build', () => {
    expect(
      createAccountOffer({ dev: false, keptData: false, chosen: true })
    ).toEqual({ offered: false, open: false })
  })

  it('never opens an account’s kept data signed out', () => {
    // Chosen before the server signed this browser out (`replaced`).
    expect(
      createAccountOffer({ dev: true, keptData: true, chosen: true })
    ).toEqual({ offered: false, open: false })
  })

  it('opens the app without an account in a dev build with no kept data', () => {
    expect(
      createAccountOffer({ dev: true, keptData: false, chosen: false })
    ).toEqual({ offered: true, open: false })
    expect(
      createAccountOffer({ dev: true, keptData: false, chosen: true })
    ).toEqual({ offered: true, open: true })
  })
})
