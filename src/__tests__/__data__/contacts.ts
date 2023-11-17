import moment from "moment";
import { Contact } from "../../types/contact";

const testContact: Contact = {
  id: "123",
  createdAt: moment().subtract(4, "months").toDate(),
  name: "John Doe",
  address: {
    line1: "123 Some St",
    line2: "Apt 1",
    city: "Cincinnati",
    state: "OH",
    country: "USA",
    zip: "41017",
  },
  email: "example@test.com",
  phone: "+1 (888) 123-5555",
};

const testContact2: Contact = {
  id: "2",
  name: "Leanne Graham",
  address: {
    line1: "Kulas Light",
    line2: "Apt. 556",
    city: "Gwenborough",
    zip: "92998-3874",
  },
  phone: "1-770-736-8031 x56442",
  createdAt: moment().subtract(1, "year").toDate(),
};

const contacts = [testContact, testContact2];

export const createFakeContact = () => {
  return { ...testContact };
};

export const createFakeContacts = () => [...contacts];
