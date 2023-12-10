import moment from "moment";
import { getStudiesForGivenMonth } from "../lib/contacts";
import { createFakeContacts } from "./__data__/contacts";
import { Conversation } from "../types/conversation";

const testDate = moment({ year: 2023, month: 10 }).toDate();

describe("lib/contacts", () => {
  describe("getTotalStudiesCount", () => {
    it("returns 0 studies if 0 conversations", () => {
      const contacts = createFakeContacts();
      const conversations: Conversation[] = [];

      const count = getStudiesForGivenMonth({
        contacts,
        conversations,
        month: testDate,
      });
      expect(count).toBe(0);
    });

    it("returns 1 study if a contact has a single corresponding study", () => {
      const contacts = createFakeContacts();
      const conversations: Conversation[] = [
        {
          contact: {
            id: contacts[0].id,
          },
          date: testDate,
          id: "1",
          isBibleStudy: true,
        },
      ];

      const count = getStudiesForGivenMonth({
        contacts,
        conversations,
        month: testDate,
      });

      expect(count).toBe(1);
    });

    it("returns 1 study if a contact has multiple corresponding study", () => {
      const contacts = createFakeContacts();
      const conversations: Conversation[] = [
        {
          contact: {
            id: contacts[0].id,
          },
          date: testDate,
          id: "1",
          isBibleStudy: true,
        },
        {
          contact: {
            id: contacts[0].id,
          },
          date: testDate,
          id: "2",
          isBibleStudy: true,
        },
      ];

      const count = getStudiesForGivenMonth({
        contacts,
        conversations,
        month: testDate,
      });

      expect(count).toBe(1);
    });

    it("returns 0 studies if a contact has multiple studies that do not match the current month", () => {
      const contacts = createFakeContacts();
      const conversations: Conversation[] = [
        {
          contact: {
            id: contacts[0].id,
          },
          date: moment(testDate).subtract(1, "month").toDate(),
          id: "1",
          isBibleStudy: true,
        },
        {
          contact: {
            id: contacts[0].id,
          },
          date: moment(testDate).subtract(1, "month").toDate(),
          id: "2",
          isBibleStudy: true,
        },
      ];

      const count = getStudiesForGivenMonth({
        contacts,
        conversations,
        month: testDate,
      });

      expect(count).toBe(0);
    });

    it("returns multiple studies if there are multiple contacts with multiple studies within the current month", () => {
      const contacts = createFakeContacts();
      const conversations: Conversation[] = [
        {
          contact: {
            id: contacts[0].id,
          },
          date: testDate,
          id: "1",
          isBibleStudy: true,
        },
        {
          contact: {
            id: contacts[1].id,
          },
          date: testDate,
          id: "2",
          isBibleStudy: true,
        },
      ];

      const count = getStudiesForGivenMonth({
        contacts,
        conversations,
        month: testDate,
      });

      expect(count).toBe(2);
    });
  });
});
