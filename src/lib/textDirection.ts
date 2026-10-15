const LETTER = /\p{L}/u

/**
 * Where right-to-left scripts' letters live: Hebrew, Arabic, Syriac, Thaana,
 * N'Ko, Samaritan, Mandaic and the Arabic supplements and extensions; Hebrew
 * and Arabic presentation forms; and the astral blocks Unicode reserves for
 * right-to-left scripts (Hanifi Rohingya, Yezidi, Sogdian, Mende Kikakui,
 * Adlam, Arabic mathematical letters…). Only letters count: these blocks'
 * digits (Arabic-Indic, Persian), punctuation and marks are neutral.
 */
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
// Isolate initiators (LRI, RLI, FSI) and their terminator (PDI): what they
// wrap doesn't decide the direction of the text around it.
const ISOLATE_START = new Set([0x2066, 0x2067, 0x2068])
const ISOLATE_END = 0x2069

const isRtlCodePoint = (code: number) =>
  RTL_RANGES.some(([from, to]) => code >= from && code <= to)

/**
 * The direction user-written text reads in, from its first strong character
 * (Unicode's "first strong" rule, UAX #9 P2–P3), or undefined when it has none.
 * Strong right-to-left: a letter of a right-to-left script, or a right-to-left
 * or Arabic letter mark (RLM, ALM). Strong left-to-right: any other letter
 * (Latin, Greek, Cyrillic, CJK…) or a left-to-right mark (LRM). Digits (Arabic-
 * Indic ones included), punctuation, symbols and emoji are neutral, and text
 * inside directional isolates is skipped.
 *
 * A note's paragraphs and list items each take theirs, in the editor and when
 * shown, so a line written in another script than the app's keeps its own side;
 * lines with no strong character follow the app's direction.
 *
 * Free of React Native, so the note editor's web page can use it too.
 */
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
