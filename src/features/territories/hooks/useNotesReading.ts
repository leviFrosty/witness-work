import { useEffect, useRef, useState } from 'react'
import {
  parseDoorNotes,
  type NoteStreet,
  type ParsedNotes,
} from '@/features/territories/lib/parseDoorNotes'
import {
  NOTES_MAX_STREETS,
  fallbackReasonFor,
  fitsScribe,
  notesFromScribe,
  type NotesAi,
  type NotesFallbackReason,
  type NotesReader,
} from '@/features/territories/lib/scribeNotes'

export type NotesReading = { parsed: ParsedNotes; reader: NotesReader }

const isEmpty = (parsed: ParsedNotes) =>
  parsed.entries.length === 0 && parsed.unrecognised.length === 0

export default function useNotesReading(ai: NotesAi) {
  const [busy, setBusy] = useState(false)
  const running = useRef<AbortController | null>(null)

  useEffect(() => () => running.current?.abort(), [])

  const read = async (
    text: string,
    options: { streets: readonly NoteStreet[]; streetId?: string }
  ): Promise<NotesReading | null> => {
    const onDevice = (reason: NotesFallbackReason): NotesReading => ({
      parsed: parseDoorNotes(text, options),
      reader: { kind: 'device', reason },
    })
    if (ai.mode !== 'available') return onDevice(fallbackReasonFor(ai.mode))
    if (!fitsScribe(text)) return onDevice('tooLong')
    if (running.current) return null

    const controller = new AbortController()
    running.current = controller
    setBusy(true)
    try {
      const outcome = await ai.read(
        {
          notes: text,
          streets: options.streets
            .slice(0, NOTES_MAX_STREETS)
            .map((street) => ({
              name: street.name.trim().slice(0, 120),
              numbering: street.numbering,
            }))
            .filter((street) => street.name),
        },
        controller.signal
      )
      if (controller.signal.aborted) return null
      if (outcome.status === 'cancelled' || outcome.status === 'consent')
        return null
      if (outcome.status === 'failed') return onDevice(outcome.reason)
      const parsed = notesFromScribe(outcome.answer, text, options)
      if (isEmpty(parsed)) {
        const fallback = onDevice('failed')
        if (!isEmpty(fallback.parsed)) return fallback
      }
      return { parsed, reader: { kind: 'scribe' } }
    } finally {
      if (running.current === controller) running.current = null
      setBusy(false)
    }
  }

  return { busy, read }
}
