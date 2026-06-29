import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { TimeEntry } from '@/types/timeEntry'
import type { Category } from '@/types/category'
import type { CustomFieldDefinition } from '@/types/customField'
import type { Publisher } from '@/types/publisher'

/**
 * The user's Publisher role + Tenure Start Date as produced by an import
 * source. Shared by every import path (MyTime, Notes) so they converge on one
 * persistence layer (`writeMappedDataToStores`).
 */
export interface MappedPublisher {
  role: Publisher
  tenureStartDate: Date | null
}

/**
 * The fully-denormalized, WitnessWork-shaped result of an import, ready to
 * write into the stores. Every record carries a deterministic id (`mytime-*` /
 * `notes-*`) so a re-run is idempotent — the stores' `add*` actions skip ids
 * they already hold.
 *
 * This type is shared infrastructure (it lives outside any one feature) because
 * both `mytime-import` and `notes-import` produce it and feed it to the same
 * `writeMappedDataToStores`.
 */
export interface MappedImport {
  contacts: Contact[]
  visits: Visit[]
  timeEntries: TimeEntry[]
  categories: Category[]
  customFieldDefs: CustomFieldDefinition[]
  publisher: MappedPublisher | null
}
