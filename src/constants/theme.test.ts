import { describe, expect, it, vi } from 'vitest'
import { contrastRatio, mix } from '@/lib/color'

vi.mock('expo-device', () => ({ deviceType: 1, DeviceType: { TABLET: 2 } }))

const { default: getThemeFromColorScheme } = await import('@/constants/theme')

type Colors = ReturnType<typeof getThemeFromColorScheme>['colors']
type Token = keyof Colors

/** A `#RRGGBBAA` tint as it renders over an opaque surface. */
const tinted = (tint: string, surface: string) =>
  mix(surface, tint.slice(0, 7), parseInt(tint.slice(7, 9), 16) / 255)

const TEXT = 4.5
const NON_TEXT = 3

const surfaces: Token[] = ['background', 'backgroundLighter', 'card', 'sheet']

/**
 * Foreground tokens and the surfaces they're drawn on, with the WCAG 2.2 AA
 * minimum. A pair that fails here makes text or icons hard to read for low
 * vision users, so fix the token rather than loosen the check.
 */
const pairs: {
  fg: Token
  on: (colors: Colors) => { name: string; color: string }[]
  min: number
}[] = [
  {
    fg: 'text',
    on: (c) => surfaces.map((s) => ({ name: s, color: c[s] })),
    min: TEXT,
  },
  // Secondary text, input placeholders, inactive tabs.
  {
    fg: 'textAlt',
    on: (c) => surfaces.map((s) => ({ name: s, color: c[s] })),
    min: TEXT,
  },
  {
    fg: 'error',
    on: (c) => surfaces.map((s) => ({ name: s, color: c[s] })),
    min: TEXT,
  },
  {
    fg: 'textInverse',
    on: (c) => [{ name: 'error', color: c.error }],
    min: TEXT,
  },
  {
    fg: 'warnText',
    on: (c) => [
      { name: 'card', color: c.card },
      {
        name: 'warnTranslucent on card',
        color: tinted(c.warnTranslucent, c.card),
      },
    ],
    min: TEXT,
  },
  {
    fg: 'supporterText',
    on: (c) => [
      { name: 'card', color: c.card },
      { name: 'backgroundLightest', color: c.backgroundLightest },
      {
        name: 'supporterTranslucent on card',
        color: tinted(c.supporterTranslucent, c.card),
      },
    ],
    min: TEXT,
  },
  { fg: 'info', on: (c) => [{ name: 'card', color: c.card }], min: TEXT },
  { fg: 'accent3', on: (c) => [{ name: 'card', color: c.card }], min: TEXT },
]

describe.each(['light', 'dark'] as const)('%s theme contrast', (scheme) => {
  const { colors } = getThemeFromColorScheme(scheme)

  for (const { fg, on, min } of pairs) {
    for (const surface of on(colors)) {
      it(`${fg} on ${surface.name} meets ${min}:1`, () => {
        expect(contrastRatio(colors[fg], surface.color)).toBeGreaterThanOrEqual(
          min
        )
      })
    }
  }
})

// The light theme's brand green (`accent`) is below AA, both as text on light
// surfaces and under white button labels. Darkening it changes the brand look,
// so it waits on a design decision; dark mode is held to AA meanwhile.
describe('dark theme accent contrast', () => {
  const { colors } = getThemeFromColorScheme('dark')

  it.each(surfaces)('accent text on %s meets 4.5:1', (surface) => {
    expect(
      contrastRatio(colors.accent, colors[surface])
    ).toBeGreaterThanOrEqual(TEXT)
  })

  it('button labels on accent meet 4.5:1', () => {
    expect(
      contrastRatio(colors.textInverse, colors.accent)
    ).toBeGreaterThanOrEqual(TEXT)
  })

  it('accent icons on the tinted accent pill meet 3:1', () => {
    expect(
      contrastRatio(
        colors.accent,
        tinted(colors.accentTranslucent, colors.card)
      )
    ).toBeGreaterThanOrEqual(NON_TEXT)
  })
})
