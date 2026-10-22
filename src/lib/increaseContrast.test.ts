import { describe, expect, it, vi } from 'vitest'
import { contrastRatio } from '@/lib/color'
import { increaseContrast } from '@/lib/increaseContrast'

vi.mock('expo-device', () => ({ deviceType: 1, DeviceType: { TABLET: 2 } }))

const { default: getThemeFromColorScheme } = await import('@/constants/theme')

const surfaces = ['background', 'backgroundLighter', 'card', 'sheet'] as const

describe.each(['light', 'dark'] as const)('increaseContrast (%s)', (scheme) => {
  const standard = getThemeFromColorScheme(scheme).colors
  const high = increaseContrast(standard)

  it.each(surfaces)('raises secondary text contrast on %s', (surface) => {
    const before = contrastRatio(standard.textAlt, standard[surface])
    const after = contrastRatio(high.textAlt, high[surface])
    expect(after).toBeGreaterThan(before + 1)
    expect(after).toBeLessThan(contrastRatio(high.text, high[surface]))
  })

  it.each(surfaces)('raises border contrast on %s', (surface) => {
    expect(contrastRatio(high.border, high[surface])).toBeGreaterThan(
      contrastRatio(standard.border, standard[surface])
    )
  })

  it('leaves every other color alone', () => {
    const { textAlt: _t, border: _b, ...rest } = high
    const { textAlt: _st, border: _sb, ...standardRest } = standard
    expect(rest).toEqual(standardRest)
  })
})
