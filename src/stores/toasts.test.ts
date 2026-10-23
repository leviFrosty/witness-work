import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import {
  MAX_TOASTS,
  resetToasts,
  toast,
  toastAcknowledged,
  toastKeys,
  toastPlacement,
  toastSettlesUnlock,
  useToasts,
} from '@/stores/toasts'

const shown = () => useToasts.getState().toasts

beforeEach(() => resetToasts())

describe('toast placement', () => {
  it("answers the User's own action at the bottom and unlocks at the top", () => {
    expect(toastPlacement('success')).toBe('bottom')
    expect(toastPlacement('error')).toBe('bottom')
    expect(toastPlacement('undo')).toBe('bottom')
    expect(toastPlacement('unlock')).toBe('top')
    expect(toastPlacement('news')).toBe('top')
  })
})

describe('toast', () => {
  it('gives Undo its localized button', () => {
    const onUndo = vi.fn()
    toast.undo({ title: 'Marked as not at home', onUndo })
    const [undo] = shown()
    expect(undo.intent).toBe('undo')
    expect(undo.action?.label).toBe('undo')
    undo.action?.onPress()
    expect(onUndo).toHaveBeenCalled()
  })

  it('shows the same feedback once', () => {
    toast.success('copied')
    toast.success('copied')
    expect(shown()).toHaveLength(1)
  })

  it('stacks unlocks, and lets an unlock replace one with its key', () => {
    const onClose = vi.fn()
    toast.unlock({ title: 'Beret', key: 'pet-item:hat:beret', onClose })
    toast.unlock({ title: 'Year Round', key: 'badge:yearRound.2' })
    expect(shown().map((t) => t.title)).toEqual(['Beret', 'Year Round'])
    toast.unlock({ title: 'Beret again', key: 'pet-item:hat:beret' })
    expect(shown().map((t) => t.title)).toEqual(['Year Round', 'Beret again'])
    expect(onClose).toHaveBeenCalledWith('replaced')
  })

  it('keeps at most a few per edge, closing the oldest as replaced', () => {
    const first = vi.fn()
    toast.unlock({ title: 'first', onClose: first })
    for (let i = 1; i < MAX_TOASTS; i++) toast.unlock({ title: `r${i}` })
    toast.success('copied')
    expect(first).not.toHaveBeenCalled()
    toast.unlock({ title: 'one more' })
    expect(first).toHaveBeenCalledWith('replaced')
    expect(shown()).toHaveLength(MAX_TOASTS + 1)
  })

  it('closes once, with why', () => {
    const onClose = vi.fn()
    const id = toast.unlock({ title: 'Beret', onClose })
    toast.dismiss(id, 'swiped')
    toast.dismiss(id, 'timeout')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith('swiped')
    expect(shown()).toEqual([])
  })

  it('lists the keys on screen, for the tray', () => {
    toast.unlock({ title: 'Beret', key: 'pet-item:hat:beret' })
    toast.success('copied')
    expect(toastKeys(shown())).toEqual(['pet-item:hat:beret'])
  })
})

describe('toastAcknowledged', () => {
  it('counts opening, swiping and the button as dealt with', () => {
    expect(toastAcknowledged('opened')).toBe(true)
    expect(toastAcknowledged('swiped')).toBe(true)
    expect(toastAcknowledged('action')).toBe(true)
  })

  it('leaves an unlock in the tray when nobody acted on it', () => {
    for (const reason of [
      'timeout',
      'background',
      'expired',
      'replaced',
      'dismissed',
    ] as const)
      expect(toastAcknowledged(reason)).toBe(false)
  })
})

describe('toastSettlesUnlock', () => {
  it('leaves an opened unlock to its full-screen moment to settle', () => {
    expect(toastSettlesUnlock('swiped')).toBe(true)
    expect(toastSettlesUnlock('opened')).toBe(false)
    expect(toastSettlesUnlock('timeout')).toBe(false)
  })
})
