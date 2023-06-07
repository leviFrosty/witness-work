export type RootStackParamList = {
  Home: undefined;
  Territory: undefined;
};

export type HomeStackParamList = {
  Dashboard: undefined;
  Settings: undefined;
  CallDetails: {
    callId: string;
  };
  VisitForm?: {
    callId: string;
  };
  CallForm?: {
    callId: string;
  };
};
