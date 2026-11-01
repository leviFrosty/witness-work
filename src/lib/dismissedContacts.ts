import moment from 'moment'
import { Contact } from '@/types/contact'

export const isContactDismissed = (contact: Contact): boolean => {
  if (!contact.dismissedUntil) {
    return false
  }

  return moment(contact.dismissedUntil).isAfter(moment())
}

export const filterActivesContacts = (contacts: Contact[]): Contact[] => {
  return contacts.filter((contact) => !isContactDismissed(contact))
}

export const getDismissedContacts = (contacts: Contact[]): Contact[] => {
  return contacts.filter((contact) => isContactDismissed(contact))
}
