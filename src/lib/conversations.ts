import moment from "moment";
import { Contact } from "../types/contact";
import { Conversation } from "./../types/conversation";

export const contactStudiedForGivenMonth = ({
  conversations,
  contact,
  month,
}: {
  conversations: Conversation[];
  contact: Contact;
  month: Date;
}) => {
  const targetMonth = moment(month);

  const hasStudied = conversations.some((conversation) => {
    // Check if the conversation involves the contact and is flagged as a study in the given month
    const isStudyInMonth =
      conversation.contact.id === contact.id &&
      conversation.isBibleStudy &&
      moment(conversation.date).isSame(targetMonth, "month");

    return isStudyInMonth;
  });

  return hasStudied;
};

export const contactHasAtLeastOneStudy = ({
  conversations,
  contact,
}: {
  conversations: Conversation[];
  contact: Contact;
}) => {
  const hasStudied = conversations.some(
    (conversation) =>
      conversation.contact.id === contact.id && conversation.isBibleStudy
  );

  return hasStudied;
};

export const contactMostRecentStudy = ({
  conversations,
  contact,
}: {
  conversations: Conversation[];
  contact: Contact;
}) => {
  const contactStudies = conversations.filter(
    (conversation) =>
      conversation.contact.id === contact.id && conversation.isBibleStudy
  );

  if (contactStudies.length === 0) {
    return null;
  }

  const sortedStudies = contactStudies.sort(
    (a, b) => moment(b.date).unix() - moment(a.date).unix()
  );

  return sortedStudies[0];
};

export const upcomingConversations = ({
  conversations,
  withinNextDays,
}: {
  conversations: Conversation[];
  withinNextDays: number;
}) => {
  const now = moment();
  const endOfDay = moment().endOf("day").hour(17); // 5pm

  const isMorning = now.isBefore(endOfDay);

  const maxDate = isMorning
    ? moment().endOf("day")
    : moment().add(withinNextDays, "days").endOf("day");

  const minDate = isMorning ? moment().subtract(6, "hours") : moment();

  return conversations.filter((conversation) => {
    const date = conversation.followUp?.date;

    const isUpcoming = moment(date).isBetween(minDate, maxDate);
    if (!isUpcoming) return;

    if (conversation.followUp?.notifyMe || conversation.followUp?.topic) {
      return conversation;
    }
  });
};
