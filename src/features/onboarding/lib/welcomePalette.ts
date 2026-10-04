import { Skia } from '@shopify/react-native-skia'
import { Theme } from '@/constants/theme'
import { withAlpha } from '@/lib/color'

export interface WelcomePalette {
  /** Scene background beneath the aurora. */
  base: string
  /** Aurora shader inputs: RGB 0–1 colours and the blend mode (1 = dark). */
  aurora: {
    dark: number
    base: number[]
    glow: number[]
    tintA: number[]
    tintB: number[]
    floor: number[]
    motes: number
  }
  text: string
  textAlt: string
  /** Frosted card fill, rim, shadow and placeholder bars. */
  surface: string
  surfaceBorder: string
  surfaceShadow: string
  surfaceShadowOpacity: { rest: number; focus: number }
  skeleton: string
  /** Ring around a badge that sits on a card's edge. */
  badgeBorder: string
  mapRoad: string
  orbit: string
  orbitLight: string
  orbitDot: string
  /** The progress ring's track, gradient and glowing head. */
  ringTrack: string
  ring: string[]
  ringHead: string
  /** Glow beneath the app tile, and the rings it sends out as it lands. */
  tileShadow: string
  ripple: string
  ctaGlowOpacity: number
}

const rgb = (color: string) => Array.from(Skia.Color(color)).slice(0, 3)

/**
 * Colours for the welcome scene. The scene has its own art direction — a deep,
 * near-black night in dark mode, a bright mint morning in light mode — built
 * from the theme's brand hues so it stays recognisably WitnessWork.
 */
export const getWelcomePalette = (theme: Theme): WelcomePalette => {
  const { colors } = theme
  const isDark = colors.background === '#121212'
  const shared = {
    orbitLight: colors.accent,
    ring: [colors.accent, colors.cyan, colors.accent],
    ringHead: colors.accent,
    ripple: colors.accent,
  }

  if (isDark) {
    const base = '#040806'
    return {
      ...shared,
      base,
      aurora: {
        dark: 1,
        base: rgb(base),
        glow: rgb(colors.accent),
        tintA: rgb(colors.cyan),
        tintB: rgb(colors.indigo),
        floor: rgb('#0E7A43'),
        motes: 1,
      },
      text: '#F3F7F4',
      textAlt: '#9AA8A0',
      surface: 'rgba(255,255,255,0.07)',
      surfaceBorder: 'rgba(255,255,255,0.12)',
      surfaceShadow: colors.shadow,
      surfaceShadowOpacity: { rest: 0.4, focus: 0.6 },
      skeleton: 'rgba(255,255,255,0.16)',
      badgeBorder: '#14211A',
      mapRoad: 'rgba(255,255,255,0.11)',
      orbit: 'rgba(255,255,255,0.07)',
      orbitDot: '#FFFFFF',
      ringTrack: 'rgba(255,255,255,0.09)',
      tileShadow: withAlpha(colors.accent, 0x99),
      ctaGlowOpacity: 0.45,
    }
  }

  const base = '#F4F8F6'
  return {
    ...shared,
    base,
    aurora: {
      dark: 0,
      base: rgb(base),
      glow: rgb(colors.accent),
      tintA: rgb(colors.cyan),
      tintB: rgb(colors.indigo),
      floor: rgb('#A7F0C6'),
      motes: 0.7,
    },
    text: '#111A15',
    textAlt: '#5E6B64',
    surface: 'rgba(255,255,255,0.78)',
    surfaceBorder: 'rgba(255,255,255,0.95)',
    surfaceShadow: '#0B3B22',
    surfaceShadowOpacity: { rest: 0.08, focus: 0.24 },
    skeleton: 'rgba(17,50,33,0.1)',
    badgeBorder: '#FFFFFF',
    mapRoad: 'rgba(17,50,33,0.09)',
    orbit: 'rgba(17,90,52,0.1)',
    orbitDot: colors.accent,
    ringTrack: 'rgba(17,90,52,0.1)',
    tileShadow: 'rgba(8,120,60,0.45)',
    ctaGlowOpacity: 0.35,
  }
}
