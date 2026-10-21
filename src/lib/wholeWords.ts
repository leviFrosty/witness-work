/** A letter, digit or apostrophe: the inside of a word. */
const WORD_END = /[\p{L}\p{M}\p{N}'’]+$/u
const WORD_START = /^[\p{L}\p{M}\p{N}'’]+/u

/**
 * Scripts written without spaces between words, where a line may break between
 * any two letters: Thai and Lao, Myanmar, Khmer, Japanese kana, CJK ideographs,
 * Hangul syllables, and CJK compatibility ideographs.
 */
const NO_SPACE_RANGES: readonly (readonly [number, number])[] = [
  [0x0e00, 0x0eff],
  [0x1000, 0x109f],
  [0x1780, 0x17ff],
  [0x3040, 0x30ff],
  [0x3400, 0x9fff],
  [0xac00, 0xd7af],
  [0xf900, 0xfaff],
]

const breaksAnywhere = (char: string) => {
  const code = char.codePointAt(0) ?? 0
  return NO_SPACE_RANGES.some(([from, to]) => code >= from && code <= to)
}

/**
 * Where laid-out text broke a word across two lines (`onTextLayout` lines), the
 * share of that word that fit on the first line: about how much the text has to
 * shrink for the word to fit whole. Null when every line ends between words. A
 * line only splits a word that is wider than the whole line on its own.
 */
export const splitWordShare = (lines: readonly string[]): number | null => {
  for (let i = 0; i < lines.length - 1; i++) {
    const head = WORD_END.exec(lines[i])?.[0]
    const tail = WORD_START.exec(lines[i + 1])?.[0]
    if (!head || !tail) continue
    if (breaksAnywhere(tail) || breaksAnywhere(head.slice(-1))) continue
    return head.length / (head.length + tail.length)
  }
  return null
}
