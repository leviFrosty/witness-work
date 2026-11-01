const WORD_END = /[\p{L}\p{M}\p{N}'’]+$/u
const WORD_START = /^[\p{L}\p{M}\p{N}'’]+/u

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
