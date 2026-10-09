import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'

vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: { getString: vi.fn(), set: vi.fn(), delete: vi.fn() },
}))

import { contentHash } from '@/lib/contentHash'
import {
  compactRichText,
  hasRichFormatting,
  isRichTextEmpty,
  richTextImages,
  richTextLinks,
  toggleRichTextTask,
  withoutRichTextImages,
} from '@/lib/richText/inspect'
import { getNoteDoc, hasNote, noteFields, sameNote } from '@/lib/richText/notes'
import { snapImageScale } from '@/lib/richText/imageScale'
import { parseRichText, parseRichTextDoc } from '@/lib/richText/parse'
import {
  plainTextToRichText,
  richTextToPlainText,
} from '@/lib/richText/plainText'
import type { RichTextDoc } from '@/types/richText'

const text = (value: string, marks?: unknown[]) =>
  marks ? { type: 'text', text: value, marks } : { type: 'text', text: value }
const p = (...content: unknown[]) =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
const doc = (...content: unknown[]) =>
  ({ type: 'doc', content }) as unknown as RichTextDoc

const formatted = doc(
  { type: 'heading', attrs: { level: 1 }, content: [text('Return visit')] },
  p(text('Talked about '), text('hope', [{ type: 'bold' }])),
  {
    type: 'bulletList',
    content: [
      { type: 'listItem', content: [p(text('Bring the brochure'))] },
      {
        type: 'listItem',
        content: [
          p(text('Ask about family')),
          {
            type: 'orderedList',
            content: [{ type: 'listItem', content: [p(text('Wife'))] }],
          },
        ],
      },
    ],
  },
  {
    type: 'taskList',
    content: [
      {
        type: 'taskItem',
        attrs: { checked: true },
        content: [p(text('Call'))],
      },
      {
        type: 'taskItem',
        attrs: { checked: false },
        content: [p(text('Visit'))],
      },
    ],
  },
  { type: 'image', attrs: { id: 'a1b2c3d4-0000', width: 800, height: 600 } },
  p(
    text('See '),
    text('the site', [{ type: 'link', attrs: { href: 'https://jw.org' } }])
  )
)

describe('plain text', () => {
  it('writes lines with list markers and link addresses, without photos', () => {
    expect(richTextToPlainText(formatted)).toBe(
      [
        'Return visit',
        'Talked about hope',
        '• Bring the brochure',
        '• Ask about family',
        '  1. Wife',
        '☑ Call',
        '☐ Visit',
        'See the site (https://jw.org)',
      ].join('\n')
    )
  })

  it('links plain-text links, keeping them as written', () => {
    expect(plainTextToRichText('Go to www.jw.org now\n\nThanks')).toEqual(
      doc(
        p(
          text('Go to '),
          text('www.jw.org', [
            { type: 'link', attrs: { href: 'https://www.jw.org' } },
          ]),
          text(' now')
        ),
        p(),
        p(text('Thanks'))
      )
    )
  })

  it('round-trips any plain text after trimming', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const normalized = value.replace(/\r\n?/g, '\n').trim()
        expect(richTextToPlainText(plainTextToRichText(value))).toBe(normalized)
      })
    )
  })
})

describe('parseRichTextDoc', () => {
  it('keeps supported content as is', () => {
    expect(parseRichTextDoc(formatted)).toEqual(formatted)
  })

  it('keeps the words of blocks it does not know', () => {
    expect(
      parseRichTextDoc(
        doc(
          { type: 'blockquote', content: [p(text('Quoted'))] },
          p(text('After'))
        )
      )
    ).toEqual(doc(p(text('Quoted')), p(text('After'))))
  })

  it('drops unsafe links, unknown marks and image sources', () => {
    expect(
      parseRichTextDoc(
        doc(
          p(
            text('x', [
              { type: 'link', attrs: { href: 'javascript:alert(1)' } },
              { type: 'highlight' },
              { type: 'italic' },
            ])
          ),
          {
            type: 'image',
            attrs: { id: 'a1b2c3d4', width: 10, height: 10, src: 'file:///x' },
          },
          { type: 'image', attrs: { id: '../etc', width: 10, height: 10 } }
        )
      )
    ).toEqual(
      doc(p(text('x', [{ type: 'italic' }])), {
        type: 'image',
        attrs: { id: 'a1b2c3d4', width: 10, height: 10 },
      })
    )
  })

  it('keeps a resized photo as a share of the note, clamped and rounded', () => {
    const image = (scale: unknown) => ({
      type: 'image',
      attrs: { id: 'a1b2c3d4', width: 10, height: 10, scale },
    })
    const scales = (value: RichTextDoc | null) =>
      richTextImages(value!).map((attrs) => attrs.scale)
    expect(
      scales(
        parseRichTextDoc(
          doc(
            image(0.5),
            image(0.3333),
            image(0.1),
            image(4),
            image(null),
            image('0.5'),
            image(Number.NaN),
            image(-1)
          )
        )
      )
    ).toEqual([0.5, 0.33, 0.25, 1, undefined, undefined, undefined, undefined])
    // An unscaled photo keeps no `scale` key, so it saves unchanged.
    expect(parseRichTextDoc(doc(image(null)))!.content[0]).toEqual({
      type: 'image',
      attrs: { id: 'a1b2c3d4', width: 10, height: 10 },
    })
  })

  it('snaps a resize drag to quarters near them', () => {
    expect(snapImageScale(0.52)).toBe(0.5)
    expect(snapImageScale(0.6)).toBe(0.6)
    expect(snapImageScale(0.98)).toBe(1)
    expect(snapImageScale(1.4)).toBe(1)
    expect(snapImageScale(0.05)).toBe(0.25)
    expect(snapImageScale(0.4123)).toBe(0.41)
  })

  it('merges neighbouring text with the same marks and orders marks', () => {
    expect(
      parseRichTextDoc(
        doc(
          p(
            text('a', [{ type: 'italic' }, { type: 'bold' }]),
            text('b', [{ type: 'bold' }, { type: 'italic' }])
          )
        )
      )
    ).toEqual(doc(p(text('ab', [{ type: 'bold' }, { type: 'italic' }]))))
  })

  it('gives an item without a paragraph one', () => {
    expect(
      parseRichTextDoc(
        doc({
          type: 'bulletList',
          content: [{ type: 'listItem', content: [] }],
        })
      )
    ).toEqual(
      doc({
        type: 'bulletList',
        content: [{ type: 'listItem', content: [p()] }],
      })
    )
  })

  it('rejects things that are not docs', () => {
    expect(parseRichTextDoc('hello')).toBeNull()
    expect(parseRichTextDoc({ type: 'paragraph' })).toBeNull()
  })

  it('reads its own output back unchanged', () => {
    const json = fc.letrec((tie) => ({
      node: fc.record(
        {
          type: fc.constantFrom(
            'paragraph',
            'heading',
            'bulletList',
            'orderedList',
            'taskList',
            'listItem',
            'taskItem',
            'text',
            'image',
            'hardBreak',
            'blockquote'
          ),
          text: fc.string(),
          attrs: fc.record({
            level: fc.integer(),
            checked: fc.boolean(),
            id: fc.constantFrom('a1b2c3d4', 'bad id'),
            width: fc.integer(),
            height: fc.integer(),
            start: fc.integer(),
          }),
          marks: fc.array(
            fc.record({
              type: fc.constantFrom('bold', 'italic', 'link', 'code'),
              attrs: fc.record({
                href: fc.constantFrom('https://a.co', 'javascript:x'),
              }),
            })
          ),
          content: fc.array(tie('node'), { maxLength: 3 }),
        },
        { requiredKeys: ['type'] }
      ),
    })).node
    fc.assert(
      fc.property(fc.array(json, { maxLength: 4 }), (content) => {
        const once = parseRichTextDoc({ type: 'doc', content })
        expect(parseRichTextDoc(once)).toEqual(once)
      })
    )
  })

  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        parseRichTextDoc({ type: 'doc', content: [value] })
      })
    )
  })

  it('reads only known versions', () => {
    const rich = { v: 1, doc: formatted, textHash: 'x' }
    expect(parseRichText(rich)?.doc).toEqual(formatted)
    expect(parseRichText({ ...rich, v: 2 })).toBeNull()
    expect(parseRichText({ ...rich, textHash: 4 })).toBeNull()
  })
})

describe('notes', () => {
  it('stores only plain text when the note has no formatting', () => {
    expect(noteFields(plainTextToRichText('Hi www.jw.org'))).toEqual({
      note: 'Hi www.jw.org',
      noteDoc: undefined,
    })
  })

  it('stores the doc when it has formatting', () => {
    const fields = noteFields(formatted)
    expect(fields.note).toBe(richTextToPlainText(formatted))
    expect(fields.noteDoc?.textHash).toBe(contentHash(fields.note ?? ''))
    expect(getNoteDoc(fields)).toEqual(formatted)
  })

  it('clears both fields for an empty note', () => {
    expect(noteFields(doc(p(), p(text('  '))))).toEqual({
      note: undefined,
      noteDoc: undefined,
    })
  })

  it('keeps a photo-only note', () => {
    const photo = doc({
      type: 'image',
      attrs: { id: 'a1b2c3d4', width: 1, height: 1 },
    })
    const fields = noteFields(photo)
    expect(fields.note).toBeUndefined()
    expect(hasNote(fields)).toBe(true)
    expect(getNoteDoc(fields)).toEqual(photo)
  })

  it('prefers plain text an older app version edited', () => {
    const fields = { ...noteFields(formatted), note: 'Edited elsewhere' }
    expect(getNoteDoc(fields)).toEqual(doc(p(text('Edited elsewhere'))))
  })

  it('falls back to plain text for a malformed doc', () => {
    expect(getNoteDoc({ note: 'Plain', noteDoc: { v: 1 } as never })).toEqual(
      doc(p(text('Plain')))
    )
  })

  it('compares notes by what they say', () => {
    expect(sameNote({ note: 'a' }, noteFields(doc(p(text('a')), p())))).toBe(
      true
    )
    expect(sameNote({ note: 'a' }, { note: 'b' })).toBe(false)
  })
})

describe('inspect', () => {
  it('finds images and web links', () => {
    expect(richTextImages(formatted).map((image) => image.id)).toEqual([
      'a1b2c3d4-0000',
    ])
    expect(richTextLinks(formatted)).toEqual(['https://jw.org'])
  })

  it('knows empty and formatted notes', () => {
    expect(isRichTextEmpty(doc(p(), { type: 'bulletList', content: [] }))).toBe(
      true
    )
    expect(hasRichFormatting(plainTextToRichText('a https://x.com'))).toBe(
      false
    )
    expect(hasRichFormatting(formatted)).toBe(true)
  })

  it('removes photos', () => {
    expect(richTextImages(withoutRichTextImages(formatted))).toEqual([])
  })

  it('trims blank paragraphs at the ends', () => {
    expect(compactRichText(doc(p(), p(text('a')), p(), p()))).toEqual(
      doc(p(text('a')))
    )
  })

  it('toggles checklist items in reading order', () => {
    const nested = doc({
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [
            p(text('Parent')),
            {
              type: 'taskList',
              content: [
                {
                  type: 'taskItem',
                  attrs: { checked: false },
                  content: [p(text('Child'))],
                },
              ],
            },
          ],
        },
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [p(text('Next'))],
        },
      ],
    })
    expect(richTextToPlainText(toggleRichTextTask(nested, 1))).toBe(
      '☐ Parent\n  ☑ Child\n☐ Next'
    )
  })
})
