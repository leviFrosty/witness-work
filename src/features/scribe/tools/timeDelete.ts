import { z } from 'zod/v4'
import { defineWriteTool } from '@/features/scribe/tools/types'
import {
  entryCategory,
  oneLine,
  optionalDay,
  optionalRef,
  resolveEntry,
} from '@/features/scribe/tools/shared'
import { entryMinutes } from '@/lib/entryMinutes'
import { storedDayKey } from '@/lib/normalizeDate'

export default defineWriteTool({
  name: 'time_delete',
  area: 'time',
  destructive: true,
  description:
    'Propose deleting one Time Entry, only when the User asks to remove it, by entryRef (from time_list) or onDate (its day). To fix one, use time_update.',
  input: z.strictObject({ entryRef: optionalRef, onDate: optionalDay }),
  propose: (input, ctx) => {
    const found = resolveEntry(ctx, input.entryRef, input.onDate)
    if (!found.ok) return found
    const { entry } = found
    if (
      ctx.draft.effects.some(
        (effect) => effect.kind === 'time.delete' && effect.entryId === entry.id
      )
    )
      return {
        ok: false,
        error: 'That entry is already proposed for deletion.',
      }
    return {
      ok: true,
      effects: [
        {
          kind: 'time.delete',
          entryId: entry.id,
          entryDate: storedDayKey(entry.date),
          entryMinutes: entryMinutes(entry),
          entryCategory: entryCategory(entry),
          entryNote: entry.note ? oneLine(entry.note, 120) : null,
          expectUpdatedAt: entry.updatedAt ?? null,
        },
      ],
    }
  },
})
