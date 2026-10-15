/**
 * Search folding for Arabic, so a query matches however the stored text was
 * spelled: harakat (tashkeel) and the tatweel stretch are dropped, the hamza
 * and madda forms of alef (أ إ آ ٱ) read as ا, ta marbuta (ة) as ه, and alef
 * maqsura (ى) as ي. Arabic-Indic (٠-٩) and Persian (۰-۹) digits read as 0-9, so
 * a number typed on an Arabic keyboard finds one stored in Latin digits and the
 * other way round. Text without Arabic characters passes through unchanged, so
 * search in every other script behaves as before.
 *
 * Fold both the indexed text and the query.
 */

// Any Arabic-block letter or mark, including presentation forms.
const ARABIC =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

// Harakat, Quranic annotation marks, superscript alef, and the tatweel.
const DROPPED =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640]/

// One character for one, so folded indices stay aligned with the source.
const REPLACED: Record<string, string> = {
  '\u0623': '\u0627', // أ → ا
  '\u0625': '\u0627', // إ → ا
  '\u0622': '\u0627', // آ → ا
  '\u0671': '\u0627', // ٱ → ا
  '\u0629': '\u0647', // ة → ه
  '\u0649': '\u064A', // ى → ي
}
for (let d = 0; d <= 9; d++) {
  REPLACED[String.fromCharCode(0x0660 + d)] = String(d) // ٠-٩ → 0-9
  REPLACED[String.fromCharCode(0x06f0 + d)] = String(d) // ۰-۹ → 0-9
}

/** Folds Arabic spelling variants for search; other text is returned as is. */
export function foldArabicForSearch(text: string): string {
  if (!ARABIC.test(text)) return text
  let out = ''
  for (const char of text) {
    if (DROPPED.test(char)) continue
    out += REPLACED[char] ?? char
  }
  return out
}

/**
 * {@link foldArabicForSearch} plus, for each UTF-16 index of the folded text,
 * the index it came from in `text`, so match ranges found in the folded text
 * can be mapped back for highlighting. `null` when folding changed nothing.
 */
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

/**
 * Maps an inclusive `[start, end]` range in folded text back onto the source
 * text. Marks dropped right after the last matched letter stay attached to it,
 * so a highlighted letter keeps its harakat.
 */
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
