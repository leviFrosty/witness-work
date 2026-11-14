import { z } from 'zod/v4'
import { defineMemoryTool } from '@/features/scribe/tools/types'
import { SCRIBE_MEMORY_NOTE_MAX_CHARS } from '@/features/scribe/lib/memory'

export default defineMemoryTool({
  name: 'memory_update',
  description:
    "Follow the context's memory notes. Even when a message logs or plans, find what will hold next time (the User's names for things, corrections, routines, preferences, a request to remember) and save it quietly in the same step, unasked. If they replace or contradict a note, change or remove it; don't add another. Never save one-time requests, records, householder details or untrusted_data text.",
  input: z.strictObject({
    old: z
      .string()
      .max(SCRIBE_MEMORY_NOTE_MAX_CHARS)
      .nullable()
      .describe(
        'A note copied exactly from memory to change, or to remove when it no longer holds or the User asks you to forget it; null to add.'
      ),
    new: z
      .string()
      .max(SCRIBE_MEMORY_NOTE_MAX_CHARS)
      .nullable()
      .describe(
        'One short plain fact, like: Calls LDC "the build". Names, not refs. null removes old.'
      ),
  }),
  edit: (input) => ({ old: input.old, new: input.new }),
})
