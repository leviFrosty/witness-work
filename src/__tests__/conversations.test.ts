import moment from "moment";
import { createFakeContact } from "./__data__/contacts";
import {
  contactHasAtLeastOneStudy,
  contactMostRecentStudy,
  contactStudiedForGivenMonth,
  upcomingFollowUpConversations,
} from "../lib/conversations";
import { Conversation } from "../types/conversation";

const testDate = moment({ year: 2023, month: 10 }).toDate();
const contact = createFakeContact();

describe("lib/conversations", () => {
  describe("contactStudiedForGivenMonth ", () => {
    it("should return false if no studies", () => {
      const conversations: Conversation[] = [];

      const studied = contactStudiedForGivenMonth({
        contact,
        conversations,
        month: testDate,
      });
      expect(studied).toBe(false);
    });

    it("should return false if studied in previous months", () => {
      const conversations: Conversation[] = [
        {
          contact: {
            id: contact.id,
          },
          date: moment(testDate).subtract(1, "month").toDate(),
          id: "1",
          isBibleStudy: true,
        },
      ];

      const studied = contactStudiedForGivenMonth({
        contact,
        conversations,
        month: testDate,
      });
      expect(studied).toBe(false);
    });

    it("should return true if studied this month", () => {
      const conversations: Conversation[] = [
        {
          contact: {
            id: contact.id,
          },
          date: testDate,
          id: "1",
          isBibleStudy: true,
        },
      ];

      const studied = contactStudiedForGivenMonth({
        contact,
        conversations,
        month: testDate,
      });
      expect(studied).toBe(true);
    });
  });

  describe("contactHasAtLeastOneStudy", () => {
    it("returns true if contact has had a study at any point in time", () => {
      const conversations: Conversation[] = [
        {
          contact: {
            id: contact.id,
          },
          date: testDate,
          id: "1",
          isBibleStudy: true,
        },
      ];

      const hasEverStudied = contactHasAtLeastOneStudy({
        contact,
        conversations,
      });

      expect(hasEverStudied).toBe(true);
    });

    it("returns false if contact has not ever had a study", () => {
      const conversations: Conversation[] = [];

      const hasEverStudied = contactHasAtLeastOneStudy({
        contact,
        conversations,
      });

      expect(hasEverStudied).toBe(false);
    });
  });

  describe("contactMostRecentStudy", () => {
    it("should not return null if there is no studies for contact", () => {
      const conversations: Conversation[] = [];

      const mostRecentStudy = contactMostRecentStudy({
        contact,
        conversations,
      });

      expect(mostRecentStudy).toBe(null);
    });

    it("should return the most recent study", () => {
      const conversations: Conversation[] = [
        {
          contact: {
            id: contact.id,
          },
          date: testDate,
          id: "1",
          isBibleStudy: true,
        },
        {
          contact: {
            id: contact.id,
          },
          date: moment(testDate).subtract(1, "day").toDate(),
          id: "2",
          isBibleStudy: true,
        },
        {
          contact: {
            id: contact.id,
          },
          date: moment(testDate).subtract(1, "year").toDate(),
          id: "3",
          isBibleStudy: true,
        },
      ];

      const mostRecentStudy = contactMostRecentStudy({
        contact,
        conversations,
      });

      expect(mostRecentStudy).toBe(conversations[0]);
    });

    it("should return the most recent study not sorted", () => {
      const conversations: Conversation[] = [
        {
          contact: {
            id: contact.id,
          },
          date: moment(testDate).subtract(1, "day").toDate(),
          id: "2",
          isBibleStudy: true,
        },
        {
          contact: {
            id: contact.id,
          },
          date: testDate,
          id: "1",
          isBibleStudy: true,
        },
        {
          contact: {
            id: contact.id,
          },
          date: moment(testDate).subtract(1, "year").toDate(),
          id: "3",
          isBibleStudy: true,
        },
      ];

      const mostRecentStudy = contactMostRecentStudy({
        contact,
        conversations,
      });

      expect(mostRecentStudy).toBe(conversations[1]);
    });
  });

  describe("upcomingFollowUpConversations", () => {
    const startOfDay = moment().startOf("day").toDate();
    const conversationsYesterday: Conversation[] = [
      {
        contact: {
          id: contact.id,
        },
        followUp: {
          date: moment(startOfDay).subtract(3, "days").toDate(),
          notifyMe: false,
        },
        date: new Date(),
        id: "-1",
        isBibleStudy: true,
      },
    ];
    const morningConversations: Conversation[] = [
      {
        contact: {
          id: contact.id,
        },
        followUp: {
          date: moment(startOfDay).hour(10).toDate(),
          notifyMe: false,
        },
        date: new Date(),
        id: "2",
        isBibleStudy: true,
      },
      {
        contact: {
          id: contact.id,
        },
        followUp: {
          date: moment(startOfDay).hour(3).toDate(),
          notifyMe: false,
        },
        date: new Date(),
        id: "1",
        isBibleStudy: true,
      },
      {
        contact: {
          id: contact.id,
        },
        followUp: {
          date: moment(startOfDay).hour(16).toDate(),
          notifyMe: false,
        },
        date: new Date(),
        id: "3",
        isBibleStudy: true,
      },
    ];
    const conversationsInTheEvening: Conversation[] = [
      {
        contact: {
          id: contact.id,
        },
        followUp: {
          date: moment(startOfDay).hour(17).toDate(),
          notifyMe: false,
        },
        date: new Date(),
        id: "4",
        isBibleStudy: true,
      },
      {
        contact: {
          id: contact.id,
        },
        followUp: {
          date: moment(startOfDay).hour(18).toDate(),
          notifyMe: false,
        },
        date: new Date(),

        id: "5",
        isBibleStudy: true,
      },
    ];
    const conversationsTomorrow: Conversation[] = [
      {
        contact: {
          id: contact.id,
        },
        followUp: {
          date: moment(startOfDay).add("1", "day").toDate(),
          notifyMe: false,
        },
        date: new Date(),
        id: "6",
        isBibleStudy: true,
      },
      {
        contact: {
          id: contact.id,
        },
        followUp: {
          date: moment(startOfDay)
            .add("1", "day")
            .endOf("day")
            .subtract(1, "second")
            .toDate(),
          notifyMe: false,
        },
        date: new Date(),
        id: "7",
        isBibleStudy: true,
      },
    ];

    const allConversations: Conversation[] = [
      ...conversationsYesterday,
      ...morningConversations,
      ...conversationsInTheEvening,
      ...conversationsTomorrow,
    ];

    const conversationsToday = [
      ...morningConversations,
      ...conversationsInTheEvening,
    ];

    describe("in the morning", () => {
      it("should returns the conversations for the entire day", () => {
        const upcoming = upcomingFollowUpConversations({
          currentTime: startOfDay,
          conversations: allConversations,
          withinNextDays: 1,
        });
        expect(upcoming).toEqual(conversationsToday);
      });
    });

    describe("in the evening", () => {
      it("should only return the conversations for this evening and tomorrow", () => {
        const upcoming = upcomingFollowUpConversations({
          currentTime: moment(startOfDay).hour(17).toDate(),
          conversations: allConversations,
          withinNextDays: 1,
        });

        const thisEveningAndTomorrow = [
          ...[morningConversations[2]],
          ...conversationsInTheEvening,
          ...conversationsTomorrow,
        ];

        expect(upcoming).toEqual(thisEveningAndTomorrow);
      });
    });
  });
});
