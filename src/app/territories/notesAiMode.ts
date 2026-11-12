import type { ScribeAvailability } from '@/features/scribe/types'
import type { NotesAiMode } from '@/features/territories/lib/scribeNotes'

export const notesAiMode = (
  offered: boolean,
  availability: ScribeAvailability
): NotesAiMode => {
  if (!offered) return 'notOffered'
  switch (availability.status) {
    case 'hidden':
      return availability.reason === 'flag_off' ? 'off' : 'unavailable'
    case 'offline':
      return 'offline'
    case 'blocked':
      return 'unavailable'
    case 'available':
      return availability.limited ? 'limited' : 'available'
  }
}
