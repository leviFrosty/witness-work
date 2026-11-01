const ARABIC =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

const DROPPED =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640]/

const REPLACED: Record<string, string> = {
  '\u0623': '\u0627',
  '\u0625': '\u0627',
  '\u0622': '\u0627',
  '\u0671': '\u0627',
  '\u0629': '\u0647',
  '\u0649': '\u064A',
}
for (let d = 0; d <= 9; d++) {
  REPLACED[String.fromCharCode(0x0660 + d)] = String(d)
  REPLACED[String.fromCharCode(0x06f0 + d)] = String(d)
}

export function foldArabicForSearch(text: string): string {
  if (!ARABIC.test(text)) return text
  let out = ''
  for (const char of text) {
    if (DROPPED.test(char)) continue
    out += REPLACED[char] ?? char
  }
  return out
}

export function foldArabicWithIndexMap(
  text: string
): { folded: string; sourceIndex: number[] } | null {
  if (!ARABIC.test(text)) return null
  let folded = ''
  const sourceIndex: number[] = []
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (DROPPED.test(char)) continue
    folded += REPLACED[char] ?? char
    sourceIndex.push(i)
  }
  return folded === text ? null : { folded, sourceIndex }
}

export function unfoldRange(
  range: readonly [number, number],
  map: { sourceIndex: number[] },
  sourceLength: number
): [number, number] {
  const [start, end] = range
  const sourceStart = map.sourceIndex[start] ?? sourceLength - 1
  const nextSource = map.sourceIndex[end + 1] ?? sourceLength
  return [sourceStart, Math.max(sourceStart, nextSource - 1)]
}
