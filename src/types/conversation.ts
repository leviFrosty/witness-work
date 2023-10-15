export type Conversation = {
  id: string;
  contact: {
    id: string;
  };
  date: Date;
  note?: string;
  followUp?: {
    date: Date;
  };
};
