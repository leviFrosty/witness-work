// Vendored from react-native-confetti-cannon (MIT, (c) 2019 Vincent Catillon).
// See ./LICENSE. Ported from Flow to TypeScript.

export const randomValue = (min: number, max: number): number => {
  return Math.random() * (max - min) + min
}

export const randomColor = (colors: string[]): string => {
  return colors[Math.round(randomValue(0, colors.length - 1))]
}
