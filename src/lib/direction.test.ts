import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  I18nManager: { isRTL: false },
  Platform: { OS: 'ios' as 'ios' | 'android' },
}))

vi.mock('react-native', () => native)

import {
  alignInput,
  alignText,
  flowScrollX,
  forwardSign,
  isRtlLayout,
  leftForPhysicalX,
  LTR_ISOLATE,
  ltrIsolate,
  POP_ISOLATE,
} from '@/lib/direction'
import { textDirection } from '@/lib/textDirection'

const layOut = (direction: 'ltr' | 'rtl', os: 'ios' | 'android' = 'ios') => {
  native.I18nManager.isRTL = direction === 'rtl'
  native.Platform.OS = os
}

beforeEach(() => layOut('ltr'))

describe('reading direction', () => {
  it('follows I18nManager', () => {
    expect(isRtlLayout()).toBe(false)
    expect(forwardSign()).toBe(1)
    layOut('rtl')
    expect(isRtlLayout()).toBe(true)
    expect(forwardSign()).toBe(-1)
  })

  it('mirrors a measured position for `left` only in RTL', () => {
    expect(leftForPhysicalX(30, 40, 400)).toBe(30)
    layOut('rtl')

    expect(leftForPhysicalX(30, 40, 400)).toBe(330)
  })
})

describe('flowScrollX', () => {
  it('passes offsets through left to right', () => {
    expect(flowScrollX(120, 1000, 400, false)).toBe(120)
  })

  it('counts from the far end in RTL, both ways', () => {
    expect(flowScrollX(600, 1000, 400, true)).toBe(0)
    expect(flowScrollX(0, 1000, 400, true)).toBe(600)
    expect(
      flowScrollX(flowScrollX(250, 1000, 400, true), 1000, 400, true)
    ).toBe(250)
  })

  it('never goes below zero', () => {
    expect(flowScrollX(700, 1000, 400, true)).toBe(0)
  })
})

describe('alignment', () => {
  it('leaves text to React Native, which swaps left and right itself', () => {
    layOut('rtl', 'android')
    expect(alignText('start')).toBe('left')
    expect(alignText('end')).toBe('right')
  })

  it('swaps input sides in RTL on both platforms', () => {
    expect(alignInput('start')).toBe('left')
    expect(alignInput('end')).toBe('right')
    layOut('rtl', 'ios')
    expect(alignInput('start')).toBe('right')
    expect(alignInput('end')).toBe('left')
    layOut('rtl', 'android')
    expect(alignInput('start')).toBe('right')
    layOut('ltr', 'android')
    expect(alignInput('start')).toBe('left')
  })
})

describe('ltrIsolate', () => {
  it('wraps the text in a left-to-right isolate', () => {
    expect(ltrIsolate('+1 415 555 0134')).toBe('⁦+1 415 555 0134⁩')
    expect(ltrIsolate('+1 415')).toBe(`${LTR_ISOLATE}+1 415${POP_ISOLATE}`)
  })

  it('leaves the sentence around it its own direction', () => {
    const sentence = `الرقم ${ltrIsolate('+1 415 555 0134')} غير صالح`
    expect(textDirection(sentence)).toBe('rtl')
    expect(textDirection(`${ltrIsolate('مرحبا')} Hello`)).toBe('ltr')
  })
})

describe('textDirection', () => {
  it('reads the first letter', () => {
    expect(textDirection('Hello مرحبا')).toBe('ltr')
    expect(textDirection('مرحبا Hello')).toBe('rtl')
    expect(textDirection('12:30 — שלום')).toBe('rtl')
    expect(textDirection('  (Привет)')).toBe('ltr')
  })

  it('reads Hebrew and astral right-to-left scripts', () => {
    expect(textDirection('שלום world')).toBe('rtl')

    expect(textDirection('\u{1E900}\u{1E922} hello')).toBe('rtl')

    expect(textDirection('\u{10D00} hello')).toBe('rtl')
  })

  it('skips digits and punctuation, Arabic ones included', () => {
    expect(textDirection('٣٠ :؟ Hello')).toBe('ltr')
    expect(textDirection('۱۲۳ Hello')).toBe('ltr')
    expect(textDirection('«— (مرحبا)')).toBe('rtl')
    expect(textDirection('... ?! Hello')).toBe('ltr')
  })

  it('follows a leading directional mark', () => {
    expect(textDirection('\u200F123 Hello')).toBe('rtl')
    expect(textDirection('\u200E123 مرحبا')).toBe('ltr')
    expect(textDirection('\u061C123 Hello')).toBe('rtl')
  })

  it('skips isolated text', () => {
    expect(textDirection('\u2067Hello\u2069 مرحبا')).toBe('rtl')
  })

  it('has no direction without letters', () => {
    expect(textDirection('')).toBeUndefined()
    expect(textDirection('123 - 4!')).toBeUndefined()
    expect(textDirection('٠١٢٣٤٥٦٧٨٩')).toBeUndefined()
    expect(textDirection('۱۲۳، ۴۵۶؛')).toBeUndefined()
    expect(textDirection('🙂👍🏽 ❤️')).toBeUndefined()
  })
})
