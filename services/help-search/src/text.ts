import { stemmer } from 'stemmer'

/**
 * Keyword tokens for every Help Center locale, one tokenizer for all of them:
 *
 * - Words (letters and digits) are lowercased and lose their accents and Arabic
 *   diacritics, and ASCII words are Porter-stemmed (what AI Search's `porter`
 *   tokenizer did), so "studies" matches "study".
 * - Runs of Chinese, Japanese or Korean characters have no spaces to split on;
 *   they become overlapping two-character tokens, so 聖書研究 matches 聖書.
 * - Single Latin letters ("a", "I") are dropped: they match everything.
 */

// Han, kana and Hangul, plus the kana length mark and the kanji repeat mark.
const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}ー々]+/gu
const WORD = /[\p{L}\p{N}\p{M}]+/gu
const MARKS = /[\p{M}ـ]/gu // combining marks and the Arabic tatweel
const ARABIC_LETTERS: Record<string, string> = { ة: 'ه', ى: 'ي' }

function wordTokens(word: string, out: string[]) {
  const folded = word
    .normalize('NFD')
    .replace(MARKS, '')
    .replace(/[ةى]/g, (c) => ARABIC_LETTERS[c])
  if (!folded || (folded.length === 1 && /[a-z]/.test(folded))) return
  out.push(/^[a-z]+$/.test(folded) ? stemmer(folded) : folded)
}

function cjkTokens(run: string, out: string[]) {
  const chars = [...run]
  if (chars.length === 1) out.push(run)
  for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i] + chars[i + 1])
}

export function tokenize(text: string): string[] {
  const out: string[] = []
  for (const [word] of text.normalize('NFKC').toLowerCase().matchAll(WORD)) {
    let last = 0
    for (const match of word.matchAll(CJK)) {
      if (match.index > last) wordTokens(word.slice(last, match.index), out)
      cjkTokens(match[0], out)
      last = match.index + match[0].length
    }
    if (last < word.length) wordTokens(word.slice(last), out)
  }
  return out
}

/** Token → how often it occurs. */
export function termCounts(tokens: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const token of tokens) counts[token] = (counts[token] ?? 0) + 1
  return counts
}
