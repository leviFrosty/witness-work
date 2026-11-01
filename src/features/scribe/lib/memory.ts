export const SCRIBE_MEMORY_MAX_CHARS = 1_500

export const SCRIBE_MEMORY_NOTE_MAX_CHARS = 150

export const memoryLines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

export type ScribeMemoryChange = 'added' | 'changed' | 'removed'

export interface ScribeMemoryEdit {
  old: string | null
  new: string | null
}

export type MemoryEditResult =
  | { ok: true; text: string; change: ScribeMemoryChange | null }
  | { ok: false; error: string }

const occurrences = (text: string, part: string): number => {
  let count = 0
  for (let at = text.indexOf(part); at >= 0; at = text.indexOf(part, at + 1))
    count++
  return count
}

export function editMemory(
  text: string,
  edit: ScribeMemoryEdit,
  { wholeNotesOnly = false } = {}
): MemoryEditResult {
  const note = edit.new?.replace(/\s+/g, ' ').trim() || null
  const old = edit.old?.trim() || null
  if (!old && !note) return { ok: false, error: 'Send the note to add in new.' }
  if (note && note.length > SCRIBE_MEMORY_NOTE_MAX_CHARS)
    return {
      ok: false,
      error: `That note is ${note.length} characters, so shorten it to under ${SCRIBE_MEMORY_NOTE_MAX_CHARS}.`,
    }

  let next: string
  let change: ScribeMemoryChange
  if (!old) {
    if (memoryLines(text).includes(note!))
      return { ok: true, text, change: null }
    next = text.trim() ? `${text.trimEnd()}\n${note}` : note!
    change = 'added'
  } else {
    const lines = text.split('\n')
    const index = lines.findIndex((line) => line.trim() === old)
    if (index >= 0) {
      if (note) lines[index] = note
      else lines.splice(index, 1)
      next = lines.join('\n').trim()
      change = note ? 'changed' : 'removed'
    } else {
      const count = wholeNotesOnly ? 0 : occurrences(text, old)
      if (count === 0)
        return {
          ok: false,
          error:
            'No note in memory has the text in old, so copy a note from memory exactly, or set old to null to add one.',
        }
      if (count > 1)
        return {
          ok: false,
          error:
            'The text in old is in more than one note, so copy the whole note from memory.',
        }

      next = text
        .replace(old, () => note ?? '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      change =
        memoryLines(next).length < memoryLines(text).length
          ? 'removed'
          : 'changed'
    }
  }

  if (next === text) return { ok: true, text, change: null }
  if (next.length > SCRIBE_MEMORY_MAX_CHARS)
    return {
      ok: false,
      error: `That would make memory ${next.length} of ${SCRIBE_MEMORY_MAX_CHARS} characters, so shorten or remove an outdated note first, in the same step.`,
    }
  return { ok: true, text: next, change }
}

export function replayMemoryEdits(
  text: string,
  edits: readonly ScribeMemoryEdit[]
): { text: string; changes: ScribeMemoryChange[] } {
  let next = text
  const changes: ScribeMemoryChange[] = []
  for (const edit of edits) {
    const result = editMemory(next, edit, { wholeNotesOnly: true })
    if (!result.ok) continue
    next = result.text
    if (result.change) changes.push(result.change)
  }
  return { text: next, changes }
}
