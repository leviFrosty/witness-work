import { beforeEach, describe, expect, it, vi } from 'vitest'

const i18n = vi.hoisted(() => ({ locale: 'en-us' }))
vi.mock('@/lib/locales', () => ({ _i18n: i18n }))

import { isJoinedScriptLocale, tracking } from '@/lib/tracking'

beforeEach(() => {
  i18n.locale = 'en-us'
})

describe('isJoinedScriptLocale', () => {
  it.each(['ar', 'ar-EG', 'fa-IR', 'ur', 'pa-Arab-PK', 'syr', 'mn-Mong'])(
    '%s joins its letters',
    (locale) => expect(isJoinedScriptLocale(locale)).toBe(true)
  )

  it.each(['en-us', 'he', 'ru-RU', 'ja-jp', 'zh-TW', 'uz-Latn', 'ku-Latn'])(
    '%s does not',
    (locale) => expect(isJoinedScriptLocale(locale)).toBe(false)
  )
})

describe('tracking', () => {
  it('keeps letter spacing for separate letters', () => {
    expect(tracking(0.5)).toBe(0.5)
    i18n.locale = 'he'
    expect(tracking(-1)).toBe(-1)
  })

  it('drops it for Arabic, where spacing breaks the joins', () => {
    i18n.locale = 'ar'
    expect(tracking(0.5)).toBeUndefined()
  })
})
