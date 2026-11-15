import { describe, expect, it } from 'vitest'
import { jwLanguage, readingLink } from '@/lib/routine/jwLibrary'

const bible = (url: string | null) => new URL(url!).searchParams.get('bible')

describe('JW Library links', () => {
  it('opens the first chapter of the day whole, from its superscription', () => {
    const url = readingLink(
      {
        chapters: [
          { book: 0, chapter: 1 },
          { book: 0, chapter: 2 },
        ],
      },
      'en-us'
    )
    expect(url).toBe(
      'https://www.jw.org/finder?wtlocale=E&prefer=lang&bible=01001000-01001999'
    )
  })

  it('opens the day’s verses', () => {
    expect(
      bible(
        readingLink(
          { chapters: [{ book: 39, chapter: 5 }], verses: { from: 6, to: 10 } },
          'en-us'
        )
      )
    ).toBe('40005006-40005010')
  })

  it('starts the first verses of a chapter at its superscription', () => {
    expect(
      bible(
        readingLink(
          { chapters: [{ book: 18, chapter: 23 }], verses: { from: 1, to: 3 } },
          'en-us'
        )
      )
    ).toBe('19023000-19023003')
  })

  it('asks for the app’s language', () => {
    expect(jwLanguage('es-es')).toBe('S')
    expect(jwLanguage('pt-PT')).toBe('TPO')
    expect(jwLanguage('zh-hans-cn')).toBe('CHS')
    expect(jwLanguage('xx')).toBe('E')
  })

  it('has no link for an empty portion', () => {
    expect(readingLink({ chapters: [] }, 'en-us')).toBeNull()
  })
})
