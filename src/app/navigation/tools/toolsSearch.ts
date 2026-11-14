export function foldToolsText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function toolsSearchTokens(query: string): string[] {
  const folded = foldToolsText(query)
  return folded ? folded.split(' ') : []
}

export function matchesToolsSearch(
  tokens: readonly string[],
  ...words: (string | undefined)[]
): boolean {
  const text = foldToolsText(words.filter(Boolean).join(' '))
  return tokens.every((token) => text.includes(token))
}
