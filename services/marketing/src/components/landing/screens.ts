import manifest from './screens.json'

export type ScreenName = keyof typeof manifest

const BASE = '/images/screens'

export function screenSrcSet(name: ScreenName) {
  const { width, height, widths } = manifest[name]
  const largest = widths[widths.length - 1] ?? width
  return {
    src: `${BASE}/${name}-${largest}.webp`,
    srcSet: widths.map((w) => `${BASE}/${name}-${w}.webp ${w}w`).join(', '),
    width,
    height,
  }
}

export const screenAspect = (name: ScreenName) =>
  manifest[name].width / manifest[name].height
