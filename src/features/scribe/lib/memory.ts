/**
 * Scribe AI's memory: short notes about how the User works (their words for
 * things, corrections, lasting preferences), sent in the context of every
 * conversation (protocol: Context → `memory`). Plain text, one note a line; the
 * User can edit it in Settings, and `memory_update` edits it a note at a time.
 */

/** The whole memory, so it costs a few hundred tokens at most. */
export const SCRIBE_MEMORY_MAX_CHARS = 1_500
/** One note the model saves. */
export const SCRIBE_MEMORY_NOTE_MAX_CHARS = 150

/** The notes as the context lists them: non-empty lines, trimmed. */
export const memoryLines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

/** What one edit did to the memory (analytics counts these). */
export type ScribeMemoryChange = 'added' | 'changed' | 'removed'

/** One `memory_update` call: `old` null adds `new`; `new` null removes `old`. */
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

/**
 * `text` with one edit applied, or an error the model can act on. `old` that is
 * a whole note replaces or removes that note, even when it also appears inside
 * another one. Otherwise `old` is replaced where it appears, which must be
 * exactly once; `wholeNotesOnly` refuses that (replaying onto notes the User
 * changed, a part could now land in a different note).
 */
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
    // Saving a note already there changes nothing.
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
      // A function, so `$&` and the like in a note stay literal.
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
  // Rewriting a note as it was changes nothing.
  if (next === text) return { ok: true, text, change: null }
  if (next.length > SCRIBE_MEMORY_MAX_CHARS)
    return {
      ok: false,
      error: `That would make memory ${next.length} of ${SCRIBE_MEMORY_MAX_CHARS} characters, so shorten or remove an outdated note first, in the same step.`,
    }
  return { ok: true, text: next, change }
}

/**
 * Edits made during a step, applied again to the memory as it is now, which the
 * User changed in Settings since the step began. Only whole-note edits and
 * additions apply; one that no longer fits is skipped. Returns what applied.
 */
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
