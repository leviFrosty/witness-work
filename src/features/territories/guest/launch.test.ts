import { describe, expect, it, vi } from 'vitest'
import {
  guestLaunch,
  guestPageAddress,
  isGuestPagePath,
  takeGuestPageAddress,
} from '@/features/territories/guest/launch'

const FRAGMENT = `v1.${'a'.repeat(22)}.${'b'.repeat(22)}.${'c'.repeat(43)}`

const page = (href: string) => {
  const history = { replaceState: vi.fn() }
  return {
    history,
    window: { location: { href }, history } as unknown as Pick<
      Window,
      'location' | 'history'
    >,
  }
}

describe('guest page address', () => {
  it('matches only the guest path', () => {
    expect(isGuestPagePath('/territories/guest')).toBe(true)
    expect(isGuestPagePath('/territories/guest/')).toBe(true)
    expect(isGuestPagePath('/territories')).toBe(false)
    expect(isGuestPagePath('/territories/guest/x')).toBe(false)
  })

  it('takes the fragment out of the address into memory, once', () => {
    const { window, history } = page(
      `https://beta.app.witnesswork.app/territories/guest?utm=x#${FRAGMENT}`
    )
    expect(takeGuestPageAddress(window)).toBe(true)
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      'https://beta.app.witnesswork.app/territories/guest'
    )
    expect(guestLaunch.take()).toBe(FRAGMENT)
    expect(guestLaunch.take()).toBeNull()
  })

  it('leaves a reload without a fragment alone', () => {
    const { window, history } = page(
      'https://app.witnesswork.app/territories/guest'
    )
    expect(takeGuestPageAddress(window)).toBe(true)
    expect(history.replaceState).not.toHaveBeenCalled()
    expect(guestLaunch.take()).toBeNull()
  })

  it('ignores every other page', () => {
    const { window, history } = page(
      `https://app.witnesswork.app/b#${FRAGMENT}`
    )
    expect(takeGuestPageAddress(window)).toBe(false)
    expect(history.replaceState).not.toHaveBeenCalled()
    expect(guestPageAddress('not a url')).toBeNull()
  })
})
