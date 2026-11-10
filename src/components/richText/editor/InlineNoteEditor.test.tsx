import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ mounts: 0, capture: vi.fn() }))
vi.mock('@/components/richText/editor/RichTextEditor', async () => {
  const React = await import('react')
  function Editor(props: Record<string, unknown>) {
    React.useState(() => mocks.mounts++)
    return React.createElement('Editor', props)
  }
  return { default: Editor }
})
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))

import InlineNoteEditor from '@/components/richText/editor/InlineNoteEditor'
import { noteFields, type NoteUpdate } from '@/lib/richText/notes'
import type { NoteFields, RichTextDoc } from '@/types/richText'

type EditorProps = {
  initialDoc: RichTextDoc
  embedded: boolean
  onChange: (doc: RichTextDoc) => void
  onFocusChange: (focused: boolean) => void
  onPhotoAdded: (count: number) => void
}

const paragraph = (text: string, bold = false): RichTextDoc =>
  ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text, ...(bold && { marks: [{ type: 'bold' }] }) },
        ],
      },
    ],
  }) as RichTextDoc

let renderer: ReactTestRenderer | undefined
let saved: NoteUpdate[] = []

function Form(props: { note: NoteFields; keep: (note: NoteFields) => void }) {
  return (
    <InlineNoteEditor
      note={props.note}
      onChange={(update) => {
        saved.push(update)
        props.keep(update)
      }}
      surface='trip'
      label='Note'
      placeholder='Optional'
    />
  )
}

function mount(initial: NoteFields) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.mounts = 0
  saved = []
  let note = initial
  const draw = () => (
    <Form
      note={note}
      keep={(next) => {
        note = next
        renderer?.update(draw())
      }}
    />
  )
  act(() => {
    renderer = create(draw())
  })
  return {
    editor: () =>
      renderer!.root.findByType('Editor' as never).props as EditorProps,
    replace: (next: NoteFields) => {
      note = next
      act(() => renderer!.update(draw()))
    },
  }
}

describe('InlineNoteEditor', () => {
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
  })

  it('opens the form’s note in an embedded editor', () => {
    const form = mount({ note: 'Bring the brochure' })
    expect(form.editor().embedded).toBe(true)
    expect(JSON.stringify(form.editor().initialDoc)).toContain(
      'Bring the brochure'
    )
  })

  it('hands each edit to the form as note fields and keeps the same editor', () => {
    const form = mount({ note: undefined })
    act(() => form.editor().onFocusChange(true))
    act(() => form.editor().onChange(paragraph('Left at 9', true)))
    act(() => form.editor().onFocusChange(false))
    act(() => form.editor().onChange(paragraph('Left at 9 sharp', true)))

    expect(saved.at(-1)).toEqual(noteFields(paragraph('Left at 9 sharp', true)))
    expect(saved.at(-1)?.note).toBe('Left at 9 sharp')
    expect(saved.at(-1)?.noteDoc).toBeDefined()
    expect(mocks.mounts).toBe(1)
  })

  it('keeps the same editor when an edit empties the note', () => {
    const form = mount({ note: 'Something' })
    act(() =>
      form.editor().onChange({
        type: 'doc',
        content: [{ type: 'paragraph' }],
      } as RichTextDoc)
    )
    expect(saved.at(-1)).toEqual({ note: undefined, noteDoc: undefined })
    expect(mocks.mounts).toBe(1)
  })

  it('reloads the editor when the note changes from somewhere else', () => {
    const form = mount({ note: 'Typed at a narrow width' })
    form.replace(noteFields(paragraph('Finished in the full-screen editor')))
    expect(mocks.mounts).toBe(2)
    expect(JSON.stringify(form.editor().initialDoc)).toContain(
      'Finished in the full-screen editor'
    )
  })

  it('never reloads under the cursor', () => {
    const form = mount({ note: 'Mine' })
    act(() => form.editor().onFocusChange(true))
    form.replace({ note: 'Someone else’s' })
    expect(mocks.mounts).toBe(1)
  })

  it('reports photos against the form’s surface', () => {
    const form = mount({ note: undefined })
    form.editor().onPhotoAdded(2)
    expect(mocks.capture).toHaveBeenCalledWith('note_photo_added', {
      surface: 'trip',
      count: 2,
    })
  })
})
