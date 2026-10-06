/**
 * Pure helpers for the on-device capture inputs (voice log, photo import — ADR
 * 0014). Both produce plain text that lands in the composer draft, so the user
 * reviews and edits it before the normal text pipeline sends anything.
 */

/** How a capture fed the composer. */
export type NotesImportCaptureMethod = 'voice' | 'photo'

/**
 * How the submitted notes were produced, for analytics only: typed/pasted
 * `text`, a `voice` log, a `photo`, or `mixed` captures in one draft.
 */
export type NotesImportInputMethod = 'text' | NotesImportCaptureMethod | 'mixed'

export const NOTES_IMPORT_INPUT_METHODS: readonly NotesImportInputMethod[] = [
  'text',
  'voice',
  'photo',
  'mixed',
]

/** A voice log ends on its own after this long, keeping its transcript. */
export const VOICE_LOG_MAX_MS = 10 * 60 * 1000

/** Photos per import from the library picker. */
export const PHOTO_IMPORT_MAX_IMAGES = 5

/**
 * Adds captured text after whatever the user already has, separated by a blank
 * line, so a second page or a follow-up recording extends the same draft.
 */
export const appendCapturedText = (draft: string, captured: string): string => {
  const addition = captured.trim()
  if (!addition) return draft
  const base = draft.trimEnd()
  return base ? `${base}\n\n${addition}` : addition
}

export const inputMethodFor = (
  captures: readonly NotesImportCaptureMethod[]
): NotesImportInputMethod => {
  const unique = new Set(captures)
  if (unique.size === 0) return 'text'
  if (unique.size > 1) return 'mixed'
  return captures[0]
}

/**
 * The app's i18n locale (`en-us`, `zh-hant-tw`) as BCP-47 (`en-US`,
 * `zh-Hant-TW`), which the native recognizers match against.
 */
export const toBcp47 = (locale: string): string =>
  locale
    .split(/[-_]/)
    .filter(Boolean)
    .map((part, index) => {
      if (index === 0) return part.toLowerCase()
      if (part.length === 4)
        return part[0].toUpperCase() + part.slice(1).toLowerCase()
      return part.toUpperCase()
    })
    .join('-')

/** Coarse recording length for analytics; exact durations aren't needed. */
export const voiceDurationBucket = (ms: number): string => {
  if (ms < 15_000) return 'under_15s'
  if (ms < 60_000) return '15s_1m'
  if (ms < 180_000) return '1m_3m'
  return 'over_3m'
}
