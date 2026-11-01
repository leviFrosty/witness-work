import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { TimeEntry } from '@/types/timeEntry'
import type { Category } from '@/types/category'
import type { CustomFieldDefinition } from '@/types/customField'
import type { Publisher } from '@/types/publisher'

export interface MappedPublisher {
  role: Publisher
  tenureStartDate: Date | null
}

export interface MappedImport {
  contacts: Contact[]
  visits: Visit[]
  timeEntries: TimeEntry[]
  categories: Category[]
  customFieldDefs: CustomFieldDefinition[]
  publisher: MappedPublisher | null
}
