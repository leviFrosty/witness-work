import { coordinateAsString } from '@/lib/address'
import { Contact } from '@/types/contact'

const present = (value?: string) => (value?.trim() ? value.trim() : undefined)

export const canNavigateTo = (contact: Contact): boolean =>
  Boolean(
    Object.values(contact.address ?? {}).some((value) => present(value)) ||
      (contact.coordinate?.latitude && contact.coordinate?.longitude)
  )

export const contactAddressLines = (contact: Contact): string[] => {
  const address = contact.address ?? {}
  const region = [present(address.state), present(address.zip)]
    .filter(Boolean)
    .join(' ')
  const locality = [present(address.city), region || undefined]
    .filter(Boolean)
    .join(', ')
  const lines = [
    present(address.line1),
    present(address.line2),
    locality || undefined,
    present(address.country),
  ].filter((line): line is string => Boolean(line))
  if (lines.length > 0) return lines
  if (contact.coordinate?.latitude && contact.coordinate?.longitude)
    return [coordinateAsString(contact)]
  return []
}
