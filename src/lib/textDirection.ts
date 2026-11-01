const LETTER = /\p{L}/u

const RTL_RANGES: readonly (readonly [number, number])[] = [
  [0x0590, 0x08ff],
  [0xfb1d, 0xfdff],
  [0xfe70, 0xfeff],
  [0x10800, 0x10fff],
  [0x1e800, 0x1efff],
]

const LRM = 0x200e
const RLM = 0x200f
const ALM = 0x061c

const ISOLATE_START = new Set([0x2066, 0x2067, 0x2068])
const ISOLATE_END = 0x2069

const isRtlCodePoint = (code: number) =>
  RTL_RANGES.some(([from, to]) => code >= from && code <= to)

export function textDirection(text: string): 'ltr' | 'rtl' | undefined {
  let isolates = 0
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (ISOLATE_START.has(code)) {
      isolates++
    } else if (code === ISOLATE_END) {
      if (isolates > 0) isolates--
    } else if (isolates > 0) {
      continue
    } else if (code === RLM || code === ALM) {
      return 'rtl'
    } else if (code === LRM) {
      return 'ltr'
    } else if (LETTER.test(char)) {
      return isRtlCodePoint(code) ? 'rtl' : 'ltr'
    }
  }
  return undefined
}
