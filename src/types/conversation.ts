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
    /**
     * TODO: Refactor where there is only one notification enabled. Also simplifies ConversationForm.tsx submit function.
     */
    notifications?: Notification[]; // Changing to only one
  };
  isBibleStudy: boolean;
};
