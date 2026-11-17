import { describe, expect, it } from 'vitest'
import {
  INSTALLED_WEB_APP_TOP_INSET,
  installedWebAppTopInset,
} from '@/components/ui/layout/installedWebAppTopInset'

describe('installedWebAppTopInset', () => {
  it('leaves room under an opaque status bar', () => {
    expect(installedWebAppTopInset(0, 0)).toBe(INSTALLED_WEB_APP_TOP_INSET)
  })

  it('keeps a real inset that is already larger', () => {
    expect(installedWebAppTopInset(47, 0)).toBe(47)
  })

  it('adds nothing to a view that starts below the top', () => {
    expect(installedWebAppTopInset(0, 200)).toBe(0)
    expect(installedWebAppTopInset(0, 5)).toBe(INSTALLED_WEB_APP_TOP_INSET - 5)
  })
})
