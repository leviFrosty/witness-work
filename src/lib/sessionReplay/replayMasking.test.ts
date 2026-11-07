import { describe, expect, it } from 'vitest'
import {
  collectInterfaceStrings,
  createTextMasker,
  maskAttribute,
  maskInputValue,
  maskReplayUrl,
} from '@/lib/sessionReplay/replayMasking'

const english = {
  contacts: 'Contacts',
  logVisit: 'Log Visit',
  notes: 'Notes',
  visitedAgo: 'Visited {{name}} {{count}} days ago',
  count: { one: '{{count}} visit', other: '{{count}} visits' },
  bullet: '•',
  four: '4',
  tab: { home: 'Home' },
}
const people = {
  defaultNavPreview_contactName: 'Alex',
  onboardingBuddies_previewBuddyName: 'Grace',
  colorAmber: 'Amber',
}
const german = { contacts: 'Kontakte', logVisit: 'Besuch eintragen' }

describe('createTextMasker', () => {
  const mask = createTextMasker(collectInterfaceStrings(german, english))
  const masksGerman = createTextMasker(collectInterfaceStrings(german))

  it('keeps an exact interface string in the active language', () => {
    expect(mask('Kontakte')).toBe('Kontakte')
    expect(mask('Besuch eintragen')).toBe('Besuch eintragen')
  })

  it('masks English that a missing translation falls back to', () => {
    expect(masksGerman('Notes')).toBe('*****')
  })

  it('masks a name, an address and a note', () => {
    expect(mask('Maria Lopez')).toBe('***** *****')
    expect(mask('12 Main Street')).toBe('** **** ******')
    expect(mask('Asked about the resurrection')).toBe(
      '***** ***** *** ************'
    )
  })

  it('masks a sentence built from a string and a name', () => {
    expect(mask('Visited Maria 3 days ago')).toBe('******* ***** * **** ***')
    expect(mask('Log Visit Maria Lopez')).toBe('*** ***** ***** *****')
    expect(mask('Contacts: Maria')).toBe('********* *****')
  })

  it('masks a string that merely contains an interface string', () => {
    expect(mask('My Contacts')).toBe('** ********')
    expect(mask('Contacts.')).toBe('*********')
  })

  it('never keeps a template, a number or a symbol', () => {
    expect(mask('Visited {{name}} {{count}} days ago')).not.toContain('Visited')
    expect(mask('4')).toBe('*')
    expect(mask('•')).toBe('*')
    expect(mask('2 visits')).toBe('* ******')
  })

  it('matches whatever spacing the page puts around a string', () => {
    expect(mask('  Contacts \n')).toBe('  Contacts \n')
    expect(mask('Log   Visit')).toBe('Log   Visit')
  })

  it('leaves whitespace alone', () => {
    expect(mask(' ')).toBe(' ')
    expect(mask('')).toBe('')
  })

  it('matches by Unicode normalization', () => {
    const composed = createTextMasker(collectInterfaceStrings({ a: 'Café' }))
    expect(composed('Café')).toBe('Café')
    expect(composed('Cafe')).toBe('****')
  })

  it('keeps only the active language, not another one', () => {
    expect(masksGerman('Contacts')).toBe('********')
    expect(masksGerman('Kontakte')).toBe('Kontakte')
  })

  it('reads right-to-left and non-Latin strings the same way', () => {
    const arabic = createTextMasker(
      collectInterfaceStrings({ contacts: 'جهات الاتصال' })
    )
    expect(arabic('جهات الاتصال')).toBe('جهات الاتصال')
    expect(arabic('مريم')).toBe('****')
  })
})

describe('sample names and colors', () => {
  it('are never kept, since a Contact could be called the same', () => {
    const mask = createTextMasker(collectInterfaceStrings(english, people))
    expect(mask('Alex')).toBe('****')
    expect(mask('Grace')).toBe('*****')
    expect(mask('Amber')).toBe('*****')
    expect(mask('Contacts')).toBe('Contacts')
  })
})

describe('text the User edits', () => {
  const mask = createTextMasker(collectInterfaceStrings(english))
  const inside = (selector: string) => ({
    closest: (wanted: string) => (wanted.includes(selector) ? {} : null),
  })

  it('is masked in the note editor, though it reads as an interface string', () => {
    expect(mask('Notes', inside('[contenteditable]') as never)).toBe('*****')
    expect(mask('Notes', inside('.ProseMirror') as never)).toBe('*****')
  })

  it('is kept outside it', () => {
    expect(mask('Notes', inside('.nothing') as never)).toBe('Notes')
    expect(mask('Notes')).toBe('Notes')
  })
})

describe('maskInputValue', () => {
  it('masks every character', () => {
    expect(maskInputValue('555-0100')).toBe('********')
    expect(maskInputValue('')).toBe('')
  })
})

describe('maskAttribute', () => {
  it.each([
    ['aria-label', 'Maria Lopez, 12 Main Street'],
    ['title', 'Maria Lopez'],
    ['alt', 'Photo of Maria'],
    ['placeholder', 'Search for Maria'],
    ['href', '/contacts/9f2c1'],
    ['src', 'blob:https://app/9f2c'],
    ['value', 'Maria'],
    ['id', 'contact-9f2c'],
    ['data-testid', 'contact-row-9f2c'],
    ['aria-labelledby', 'name-9f2c'],
    ['name', 'phone'],
    ['content', 'Maria'],
    ['srcset', 'a.jpg 1x'],
    ['onclick', 'steal()'],
    ['rr_dataURL', 'data:image/png;base64,AA'],
  ])('blanks %s', (name, value) => {
    expect(maskAttribute(name, value)).toBe('')
  })

  it.each([
    ['class', 'css-view-1dbjc4n r-flex-13awgt0'],
    ['dir', 'rtl'],
    ['role', 'button'],
    ['type', 'text'],
    ['d', 'M0 0L10 10'],
    ['viewBox', '0 0 24 24'],
    ['rr_width', '100px'],
    ['rr_scrollTop', '12'],
  ])('keeps %s, which the page is drawn from', (name, value) => {
    expect(maskAttribute(name, value)).toBe(value)
  })

  it('keeps a style but drops the address of any image in it', () => {
    expect(
      maskAttribute(
        'style',
        'color: red; background-image: url("blob:https://app/9f2c"); width: 10px'
      )
    ).toBe('color: red; background-image: url(); width: 10px')
    expect(
      maskAttribute('style', 'background: URL(data:image/png;base64,AA)')
    ).toBe('background: url()')
  })

  it('drops image addresses from the stylesheet the recorder inlines', () => {
    expect(
      maskAttribute('_cssText', '.a{background:url(blob:https://app/1)}')
    ).toBe('.a{background:url()}')
  })
})

describe('maskReplayUrl', () => {
  it('keeps the origin and the route', () => {
    expect(maskReplayUrl('https://app.witnesswork.app/Contacts')).toBe(
      'https://app.witnesswork.app/Contacts'
    )
  })

  it('drops the query and the hash', () => {
    expect(
      maskReplayUrl('https://app.witnesswork.app/search?q=Maria%20Lopez#top')
    ).toBe('https://app.witnesswork.app/search')
  })

  it('replaces ids in the path', () => {
    expect(
      maskReplayUrl('https://app.witnesswork.app/contacts/7f3a9c2e/edit')
    ).toBe('https://app.witnesswork.app/contacts/:id/edit')
    expect(
      maskReplayUrl(
        'https://app.witnesswork.app/contact/abcdefghijklmnopqrstuvwxyzabc'
      )
    ).toBe('https://app.witnesswork.app/contact/:id')
  })

  it('replaces a segment that looks like a name', () => {
    expect(
      maskReplayUrl('https://app.witnesswork.app/contact/Zebulon-Quixote')
    ).toBe('https://app.witnesswork.app/contact/:id')
    expect(
      maskReplayUrl('https://app.witnesswork.app/visit/Maria%20Lopez')
    ).toBe('https://app.witnesswork.app/visit/:id')
  })

  it('refuses an address that is not a web page', () => {
    expect(maskReplayUrl('data:text/plain,Maria')).toBe('')
    expect(maskReplayUrl('blob:https://app.witnesswork.app/9f2c')).toBe('')
    expect(maskReplayUrl('not a url')).toBe('')
  })
})
