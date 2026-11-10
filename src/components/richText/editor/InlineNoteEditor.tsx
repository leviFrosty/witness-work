import { useState } from 'react'
import RichTextEditor, {
  type RichTextEditorRef,
} from '@/components/richText/editor/RichTextEditor'
import { analytics } from '@/lib/analytics'
import { canonicalJson } from '@/lib/canonicalJson'
import type { NoteSurface } from '@/lib/richText/noteEditorSession'
import { getNoteDoc, noteFields, type NoteUpdate } from '@/lib/richText/notes'
import type { NoteFields, RichTextDoc } from '@/types/richText'

const InlineNoteEditor = (props: {
  ref?: React.Ref<RichTextEditorRef>
  note: NoteFields
  onChange: (note: NoteUpdate) => void
  surface: NoteSurface
  label: string
  placeholder: string
  maxLength?: number
  allowImages?: boolean
  testID?: string
}) => {
  const doc = getNoteDoc(props.note)
  const [focused, setFocused] = useState(false)
  const [shown, setShown] = useState(() => ({
    doc,
    json: canonicalJson(doc),
    revision: 0,
  }))

  if (doc !== shown.doc) {
    const json = canonicalJson(doc)
    const ours = json === shown.json || focused
    setShown({
      doc,
      json,
      revision: ours ? shown.revision : shown.revision + 1,
    })
  }

  const change = (next: RichTextDoc) => {
    const update = noteFields(next)
    const json = canonicalJson(getNoteDoc(update))
    setShown((current) => ({ ...current, json }))
    props.onChange(update)
  }

  return (
    <RichTextEditor
      key={shown.revision}
      ref={props.ref}
      embedded
      initialDoc={doc}
      placeholder={props.placeholder}
      label={props.label}
      characterLimit={props.maxLength}
      allowImages={props.allowImages ?? true}
      onChange={change}
      onFocusChange={setFocused}
      testID={props.testID}
      onPhotoAdded={(count) =>
        analytics.capture('note_photo_added', {
          surface: props.surface,
          count,
        })
      }
      onPhotoFailed={() =>
        analytics.capture('note_photo_failed', { surface: props.surface })
      }
    />
  )
}

export default InlineNoteEditor
