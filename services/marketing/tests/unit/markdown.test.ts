import { expect, test } from 'vitest'
import { slugForId } from '../../src/lib/help-center/load.ts'
import {
  docToPlainText,
  markdownToDoc,
} from '../../src/lib/help-center/markdown.ts'

const SITE = 'https://witnesswork.app'

test('slugs are kebab-case ids', () => {
  expect(slugForId('timeRollover')).toBe('time-rollover')
  expect(slugForId('iCloudSync')).toBe('icloud-sync')
  expect(slugForId('wearOs')).toBe('wear-os')
  expect(slugForId('exportCSVFile')).toBe('export-csv-file')
})

test("answers convert to the app's rich text", () => {
  const doc = markdownToDoc(
    'Open **Settings → Profile** and [read more](/privacy).\n\n- One\n- _Two_\n\n3. Three',
    SITE
  )
  expect(doc.content[0]).toEqual({
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Open ' },
      { type: 'text', text: 'Settings → Profile', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' and ' },
      {
        type: 'text',
        text: 'read more',
        marks: [
          {
            type: 'link',
            attrs: { href: 'https://witnesswork.app/privacy' },
          },
        ],
      },
      { type: 'text', text: '.' },
    ],
  })
  expect(doc.content[1]!.type).toBe('bulletList')
  expect(doc.content[2]).toMatchObject({
    type: 'orderedList',
    attrs: { start: 3 },
  })
  expect(docToPlainText(doc)).toBe(
    'Open Settings → Profile and read more (https://witnesswork.app/privacy).\n\n• One\n• Two\n\n3. Three'
  )
})

for (const [name, markdown] of [
  ['images', '![x](https://example.com/x.png)'],
  ['code', '```\ncode\n```'],
  ['inline code', 'Use `this`.'],
  ['blockquotes', '> quoted'],
  ['HTML', '<b>bold</b>'],
  ['deep headings', '### Too deep'],
  ['checklists', '- [ ] task'],
  ['insecure links', '[x](http://example.com)'],
  ['protocol-relative links', '[x](//example.com/x)'],
  ['old site paths', '[x](/witness-work/privacy)'],
]) {
  test(`answers reject ${name}`, () => {
    expect(() => markdownToDoc(markdown!, SITE)).toThrow(/isn't supported/)
  })
}
