import { describe, expect, it, vi } from 'vitest'
import {
  decideSubmit,
  isApplePlatform,
  isSubmitShortcut,
  pressSubmitAction,
  registerSubmitAction,
} from '@/lib/submitShortcut'

const key = (overrides: Partial<Parameters<typeof isSubmitShortcut>[0]>) => ({
  key: 'Enter',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
})

describe('isSubmitShortcut', () => {
  it('is Command-Enter on Apple platforms and Ctrl-Enter elsewhere', () => {
    expect(isSubmitShortcut(key({ metaKey: true }), true)).toBe(true)
    expect(isSubmitShortcut(key({ ctrlKey: true }), false)).toBe(true)
    expect(isSubmitShortcut(key({ ctrlKey: true }), true)).toBe(false)
    expect(isSubmitShortcut(key({ metaKey: true }), false)).toBe(false)
  })

  it('leaves plain Enter and other chords alone', () => {
    expect(isSubmitShortcut(key({}), true)).toBe(false)
    expect(isSubmitShortcut(key({}), false)).toBe(false)
    expect(
      isSubmitShortcut(key({ ctrlKey: true, shiftKey: true }), false)
    ).toBe(false)
    expect(isSubmitShortcut(key({ ctrlKey: true, altKey: true }), false)).toBe(
      false
    )
    expect(isSubmitShortcut(key({ ctrlKey: true, metaKey: true }), true)).toBe(
      false
    )
    expect(isSubmitShortcut(key({ ctrlKey: true, key: 's' }), false)).toBe(
      false
    )
  })

  it('ignores a held key and text being composed', () => {
    expect(isSubmitShortcut(key({ ctrlKey: true, repeat: true }), false)).toBe(
      false
    )
    expect(
      isSubmitShortcut(key({ metaKey: true, isComposing: true }), true)
    ).toBe(false)
  })

  it('knows Apple platforms by name', () => {
    expect(isApplePlatform('MacIntel')).toBe(true)
    expect(isApplePlatform('iPad')).toBe(true)
    expect(isApplePlatform('Win32')).toBe(false)
    expect(isApplePlatform('Linux x86_64')).toBe(false)
  })
})

describe('decideSubmit', () => {
  const save = { target: 'save', distance: 3, disabled: false }

  it('presses the primary button of the form being typed in', () => {
    for (const focus of ['singleLine', 'multiline'] as const)
      expect(
        decideSubmit({ focus, candidates: [save], hasField: true })
      ).toEqual({ action: 'press', target: 'save' })
  })

  it('presses the nearest button, not the form underneath', () => {
    const outer = { target: 'outer', distance: 9, disabled: false }
    expect(
      decideSubmit({
        focus: 'singleLine',
        candidates: [outer, save],
        hasField: true,
      })
    ).toEqual({ action: 'press', target: 'save' })
  })

  it('does nothing while the nearest button is disabled, and never falls through to another', () => {
    const outer = { target: 'outer', distance: 9, disabled: false }
    expect(
      decideSubmit({
        focus: 'multiline',
        candidates: [outer, { ...save, disabled: true }],
        hasField: true,
      })
    ).toEqual({ action: 'swallow' })
  })

  it('does nothing when two buttons are equally near', () => {
    expect(
      decideSubmit({
        focus: 'singleLine',
        candidates: [save, { ...save, target: 'other' }],
        hasField: true,
      })
    ).toEqual({ action: 'swallow' })
  })

  it('leaves the key to an editor or menu that handles it itself', () => {
    expect(
      decideSubmit({ focus: 'owner', candidates: [save], hasField: true })
    ).toEqual({ action: 'leave' })
  })

  it('closes a multiline input that has no form around it', () => {
    expect(
      decideSubmit({ focus: 'multiline', candidates: [], hasField: true })
    ).toEqual({ action: 'blur' })
  })

  it('lets a single-line input without a form act as it does on Enter', () => {
    expect(
      decideSubmit({ focus: 'singleLine', candidates: [], hasField: true })
    ).toEqual({ action: 'leave' })
  })

  it('submits from another control of a form, but never a screen without fields', () => {
    for (const focus of ['control', 'none'] as const) {
      expect(
        decideSubmit({ focus, candidates: [save], hasField: true })
      ).toEqual({ action: 'press', target: 'save' })
      expect(
        decideSubmit({ focus, candidates: [save], hasField: false })
      ).toEqual({ action: 'leave' })
      expect(decideSubmit({ focus, candidates: [], hasField: true })).toEqual({
        action: 'leave',
      })
    }
  })
})

describe('pressSubmitAction', () => {
  const action = (
    overrides: { disabled?: boolean; focused?: boolean } = {}
  ) => {
    const press = vi.fn()
    const remove = registerSubmitAction({
      press,
      disabled: () => overrides.disabled ?? false,
      focused: () => overrides.focused ?? true,
    })
    return { press, remove }
  }

  it('presses the newest action on the focused screen', () => {
    const screen = action()
    const sheet = action()
    const hidden = action({ focused: false })
    expect(pressSubmitAction(true)).toBe(true)
    expect(sheet.press).toHaveBeenCalledTimes(1)
    expect(screen.press).not.toHaveBeenCalled()
    expect(hidden.press).not.toHaveBeenCalled()

    sheet.remove()
    expect(pressSubmitAction(true)).toBe(true)
    expect(screen.press).toHaveBeenCalledTimes(1)
    screen.remove()
    hidden.remove()
    expect(pressSubmitAction(true)).toBe(false)
  })

  it('gives the key to a focused editor first, even with no text field focused', () => {
    const screen = action()
    const press = vi.fn()
    const remove = registerSubmitAction({
      owns: true,
      press,
      disabled: () => false,
      focused: () => true,
    })
    expect(pressSubmitAction(false)).toBe(true)
    expect(pressSubmitAction(true)).toBe(true)
    expect(press).toHaveBeenCalledTimes(2)
    expect(screen.press).not.toHaveBeenCalled()
    remove()
    screen.remove()
  })

  it('does nothing while that action is disabled or nothing is being typed', () => {
    const screen = action()
    const sheet = action({ disabled: true })
    expect(pressSubmitAction(true)).toBe(false)
    sheet.remove()
    expect(pressSubmitAction(false)).toBe(false)
    expect(screen.press).not.toHaveBeenCalled()
    screen.remove()
  })
})
