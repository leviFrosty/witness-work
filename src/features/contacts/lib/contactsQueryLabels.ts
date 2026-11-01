import type { ContactSortKey } from '@/lib/contactsSort'
import { builtInContactSortOptions } from '@/stores/preferences'
import type { CustomFieldDefinition } from '@/types/customField'

export const contactSortLabel = (
  sort: ContactSortKey,
  customFieldDefs: CustomFieldDefinition[]
): string => {
  const builtIn = builtInContactSortOptions.find((o) => o.value === sort)
  if (builtIn) return builtIn.label()
  if (sort.startsWith('customField:')) {
    const defId = sort.slice('customField:'.length)
    return customFieldDefs.find((d) => d.id === defId)?.label ?? ''
  }
  return ''
}
