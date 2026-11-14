import { describe, expect, it } from 'vitest'
import {
  foldToolsText,
  matchesToolsSearch,
  toolsSearchTokens,
} from '@/app/navigation/tools/toolsSearch'

describe('tools search', () => {
  it('splits a query into folded words', () => {
    expect(toolsSearchTokens('  Reset   ICLOUD ')).toEqual(['reset', 'icloud'])
    expect(toolsSearchTokens('Café')).toEqual(['cafe'])
  })

  it('has no words for a blank query', () => {
    expect(toolsSearchTokens('')).toEqual([])
    expect(toolsSearchTokens('   ')).toEqual([])
  })

  it('matches when every word is somewhere in the row or its ancestors', () => {
    const tokens = toolsSearchTokens('coins refund')
    expect(matchesToolsSearch(tokens, 'coins & shop', 'Refund purchases')).toBe(
      true
    )
    expect(
      matchesToolsSearch(tokens, 'coins & shop', 'Unlock whole Shop')
    ).toBe(false)
  })

  it('matches part of a word, in any case', () => {
    expect(matchesToolsSearch(['notif'], 'Test Notification')).toBe(true)
    expect(matchesToolsSearch(['xyz'], 'Test Notification')).toBe(false)
  })

  it('skips missing words', () => {
    expect(matchesToolsSearch(['wallet'], undefined, 'Coins', 'wallet')).toBe(
      true
    )
  })

  it('folds text the same way as the query', () => {
    expect(foldToolsText('  Supporter\n Sync ')).toBe('supporter sync')
  })
})
