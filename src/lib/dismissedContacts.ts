import moment from 'moment'
import { Contact } from '../types/contact'

/**
 * Checks if a contact is currently dismissed (dismissedUntil date is in the
 * future)
 */
export const isContactDismissed = (contact: Contact): boolean => {
  if (!contact.dismissedUntil) {
    return false
  }

  return moment(contact.dismissedUntil).isAfter(moment())
}

/** Filters out currently dismissed contacts from a list */
export const filterActivesContacts = (contacts: Contact[]): Contact[] => {
  return contacts.filter((contact) => !isContactDismissed(contact))
}

/** Gets only the dismissed contacts from a list */
export const getDismissedContacts = (contacts: Contact[]): Contact[] => {
  return contacts.filter((contact) => isContactDismissed(contact))
}

/**
 * Checks if any contacts have expired dismiss periods and automatically
 * undismisses them
 */
export const cleanupExpiredDismissals = (contacts: Contact[]): Contact[] => {
  return contacts.map((contact) => {
    if (
      contact.dismissedUntil &&
      moment(contact.dismissedUntil).isSameOrBefore(moment())
    ) {
      // Dismiss period has expired, remove the dismissal
      const updatedContact = { ...contact }
      delete updatedContact.dismissedUntil
      return updatedContact
    }
    return contact
  })
}
