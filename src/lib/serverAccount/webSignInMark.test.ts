import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  webSignInLater,
  webSignInMark,
} from '@/lib/serverAccount/webSignInMark'

beforeEach(() => {
  const items = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the tab’s sign-in mark', () => {
  it('keeps a mark across a reload, and forgets an empty one', () => {
    webSignInMark.write({ approvedBy: 'Sample Phone', openedAt: 1 })
    expect(webSignInMark.read()).toEqual({
      approvedBy: 'Sample Phone',
      openedAt: 1,
    })
    webSignInMark.write({})
    expect(webSignInMark.read()).toBeNull()
  })

  it('clears Create an Account’s choice', () => {
    expect(webSignInLater.read()).toBe(false)
    webSignInLater.write()
    expect(webSignInLater.read()).toBe(true)
    webSignInLater.clear()
    expect(webSignInLater.read()).toBe(false)
  })
})
