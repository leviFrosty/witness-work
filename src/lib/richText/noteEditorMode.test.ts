import { describe, expect, it } from 'vitest'
import { noteEditorMode } from '@/lib/richText/noteEditorMode'
import { getAdaptiveLayout } from '@/lib/sidebarLayout'

const mode = (
  width: number,
  {
    embedsInPage = true,
    fontScale = 1,
    sidebarWidth = 240,
    sidebarHidden = false,
    verticalBarEdge = null as 'left' | 'right' | null,
  } = {}
) =>
  noteEditorMode(
    getAdaptiveLayout(width, fontScale, sidebarWidth, sidebarHidden, {
      verticalBarEdge,
    }),
    embedsInPage
  )

describe('noteEditorMode', () => {
  it('edits notes in the form in a desktop-sized browser window', () => {
    expect(mode(1280)).toBe('inline')
    expect(mode(1920)).toBe('inline')
  })

  it('keeps the full-screen editor in a phone-sized browser window', () => {
    expect(mode(390)).toBe('takeover')
    expect(mode(744)).toBe('takeover')
  })

  it('draws the line where the layout turns wide, at 760 of content', () => {
    expect(mode(759)).toBe('takeover')
    expect(mode(760)).toBe('inline')
  })

  it('counts the room left beside the sidebar, not the window', () => {
    expect(mode(1000, { sidebarWidth: 240 })).toBe('inline')
    expect(mode(1000, { sidebarWidth: 360 })).toBe('takeover')
    expect(mode(1000, { sidebarWidth: 360, sidebarHidden: true })).toBe(
      'inline'
    )
  })

  it('keeps the full-screen editor at large text sizes', () => {
    expect(mode(1280, { fontScale: 1.4 })).toBe('takeover')
  })

  it('keeps the full-screen editor wherever the editor is a web view, whatever the size', () => {
    for (const width of [390, 744, 951, 1133, 1194, 1366]) {
      expect(mode(width, { embedsInPage: false })).toBe('takeover')
    }
    expect(mode(951, { embedsInPage: false, verticalBarEdge: 'right' })).toBe(
      'takeover'
    )
  })
})
