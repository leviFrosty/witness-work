import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mode: 'takeover' as 'inline' | 'takeover',
  open: vi.fn(),
}))
vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('lucide-react-native', () => ({ Maximize2: 'Maximize2' }))
vi.mock('@/components/RichNote', () => ({ default: 'RichNote' }))
vi.mock('@/components/richText/editor/InlineNoteEditor', () => ({
  default: 'InlineNoteEditor',
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/inputs/InputRowContainer', () => ({
  default: 'InputRowContainer',
}))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, numbers: {} }),
}))
vi.mock('@/hooks/useNoteEditorMode', () => ({ default: () => mocks.mode }))
vi.mock('@/hooks/useOpenNoteEditor', () => ({
  useOpenNoteEditor: () => mocks.open,
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import NoteInputRow from '@/components/ui/inputs/NoteInputRow'

const render = (mode: 'inline' | 'takeover') => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.mode = mode
  mocks.open.mockClear()
  const onChange = vi.fn()
  let renderer!: ReturnType<typeof create>
  act(() => {
    renderer = create(
      <NoteInputRow
        label='Note'
        note={{ note: 'Bring the brochure' }}
        onChange={onChange}
        surface='trip'
        placeholder='Optional'
        maxLength={500}
        allowImages={false}
        testID='trip-note'
      />
    )
  })
  return { root: renderer.root, onChange }
}

describe('NoteInputRow', () => {
  it('opens the full-screen editor from a preview on a compact layout', () => {
    const { root } = render('takeover')
    expect(root.findAllByType('InlineNoteEditor' as never)).toHaveLength(0)
    const preview = root.findByType('Button' as never)
    expect(preview.props.testID).toBe('trip-note')

    preview.props.onPress()
    expect(mocks.open).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'trip',
        title: 'Note',
        characterLimit: 500,
        allowImages: false,
      })
    )
  })

  it('edits the note in the form on a wide layout, with the same limits', () => {
    const { root, onChange } = render('inline')
    expect(root.findAllByType('Button' as never)).toHaveLength(0)
    const editor = root.findByType('InlineNoteEditor' as never)
    expect(editor.props).toMatchObject({
      note: { note: 'Bring the brochure' },
      surface: 'trip',
      label: 'Note',
      placeholder: 'Optional',
      maxLength: 500,
      allowImages: false,
      testID: 'trip-note',
    })
    expect(editor.props.onChange).toBe(onChange)
    expect(mocks.open).not.toHaveBeenCalled()
  })
})
