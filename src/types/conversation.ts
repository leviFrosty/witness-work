export type Notification = {
  date: Date;
  id: string;
};

export type Conversation = {
  id: string;
  contact: {
    id: string;
  };
  date: Date;
  note?: string;
  followUp?: {
    date: Date;
    notifyMe: boolean;
    topic?: string;
    notifications?: Notification[];
  };
  isBibleStudy: boolean;
};
