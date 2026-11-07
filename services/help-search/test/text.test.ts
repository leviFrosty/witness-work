import { describe, expect, it } from 'vitest'
import { termCounts, tokenize } from '../src/text'

describe('tokenize', () => {
  it('lowercases and stems English words', () => {
    expect(tokenize('How are Bible Studies counted?')).toEqual([
      'how',
      'ar',
      'bibl',
      'studi',
      'count',
    ])
  })
  it('drops single letters', () => {
    expect(tokenize('Can I add a photo')).toEqual(['can', 'add', 'photo'])
  })
  it('folds accents, so they match either way', () => {
    expect(tokenize('estudios bíblicos')).toEqual(tokenize('Estudios biblicos'))
  })
  it('folds Arabic diacritics and letter variants', () => {
    expect(tokenize('أَحْسِب الصلاة')).toEqual(tokenize('احسب الصلاه'))
  })
  it('splits Chinese, Japanese and Korean into character pairs', () => {
    expect(tokenize('聖書研究')).toEqual(['聖書', '書研', '研究'])
    expect(tokenize('ルート')).toEqual(['ルー', 'ート'])
    expect(tokenize('다크 모드')).toEqual(['다크', '모드'])
  })
  it('keeps a single CJK character', () => {
    expect(tokenize('本')).toEqual(['本'])
  })
  it('separates Latin words inside CJK text', () => {
    expect(tokenize('iCloud同期を使う')).toEqual([
      'icloud',
      '同期',
      '期を',
      'を使',
      '使う',
    ])
  })
  it('counts terms', () => {
    expect(termCounts(['a', 'b', 'a'])).toEqual({ a: 2, b: 1 })
  })
})
