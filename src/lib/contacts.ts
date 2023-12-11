import { Contact } from "../types/contact";
import { Conversation } from "../types/conversation";
import { contactStudiedForGivenMonth } from "./conversations";

export const getStudiesForGivenMonth = ({
  contacts,
  conversations,
  month,
}: {
  contacts: Contact[];
  conversations: Conversation[];
  month: Date;
}) => {
  return contacts.reduce((accumulator, contact) => {
    if (contactStudiedForGivenMonth({ contact, conversations, month })) {
      return accumulator + 1;
    }
    return accumulator;
  }, 0);
};
