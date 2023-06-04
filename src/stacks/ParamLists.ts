export type RootStackParamList = {
  Home: undefined;
  Territory: undefined;
};

export type HomeStackParamList = {
  Dashboard: undefined;
  Settings: undefined;
  CallDetails: {
    id: string;
  };
  CallForm: undefined;
};
