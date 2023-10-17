import { Contact } from "../types/contact";

export const getTotalStudiesCount = (contacts: Contact[]) => {
  return contacts.reduce(
    (accumulator, contact) =>
      contact.isBibleStudy ? accumulator + 1 : accumulator,
    0
  );
};
