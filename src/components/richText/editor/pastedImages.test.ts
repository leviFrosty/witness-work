import { describe, expect, it } from 'vitest'
import {
  pastedImageFiles,
  transferHasFiles,
} from '@/components/richText/editor/pastedImages'

const file = (name: string, type: string) => new File(['x'], name, { type })

const transfer = (files: File[], data: Record<string, string> = {}) => ({
  files,
  getData: (type: string) => data[type] ?? '',
})

describe('pastedImageFiles', () => {
  it('takes a screenshot, which is an image file and nothing else', () => {
    const shot = file('image.png', 'image/png')
    expect(pastedImageFiles(transfer([shot]))).toEqual([shot])
  })

  it("takes an image copied from a page, whose HTML is only the page's <img>", () => {
    const copied = file('image.png', 'image/png')
    expect(
      pastedImageFiles(
        transfer([copied], {
          'text/html':
            '<html><body><!--StartFragment--><meta charset="utf-8"><img src="https://example.com/a.png" alt="A hill"><!--EndFragment--></body></html>',
        })
      )
    ).toEqual([copied])
  })

  it('takes image files copied from a file manager, which adds their names as text', () => {
    const files = [file('a.jpg', 'image/jpeg'), file('b.png', 'image/png')]
    expect(
      pastedImageFiles(transfer(files, { 'text/plain': 'a.jpg' }))
    ).toEqual(files)
  })

  it('leaves text to the editor when an app adds a picture of it, as spreadsheets do', () => {
    expect(
      pastedImageFiles(
        transfer([file('image.png', 'image/png')], {
          'text/html':
            '<table><tr><td>Monday</td><td>3 hours</td></tr></table>',
          'text/plain': 'Monday\t3 hours',
        })
      )
    ).toEqual([])
  })

  it('ignores styles and comments when deciding whether the HTML has text', () => {
    const copied = file('image.png', 'image/png')
    expect(
      pastedImageFiles(
        transfer([copied], {
          'text/html':
            '<style>p{color:red}</style><!-- note -->&nbsp;<img src="x.png">',
        })
      )
    ).toEqual([copied])
  })

  it('takes nothing when a file is not an image', () => {
    expect(
      pastedImageFiles(
        transfer([
          file('a.png', 'image/png'),
          file('report.pdf', 'application/pdf'),
        ])
      )
    ).toEqual([])
  })

  it('takes nothing from plain or formatted text', () => {
    expect(pastedImageFiles(transfer([], { 'text/plain': 'hello' }))).toEqual(
      []
    )
    expect(pastedImageFiles(null)).toEqual([])
  })

  it('survives a clipboard that refuses to be read', () => {
    const shot = file('image.png', 'image/png')
    expect(
      pastedImageFiles({
        files: [shot],
        getData: () => {
          throw new Error('denied')
        },
      })
    ).toEqual([shot])
  })

  it('says whether a drop carries files at all', () => {
    expect(transferHasFiles(transfer([file('a.pdf', 'application/pdf')]))).toBe(
      true
    )
    expect(transferHasFiles(transfer([]))).toBe(false)
  })
})
