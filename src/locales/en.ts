const en = {
  hello: "Hello",
  goodBye: "Goodbye",
  welcomeTo: "Welcome To",
  jwTime: "JW Time",
  getStarted: "Get Started",
  whatTypePublisherAreYou: "What type of publisher are you?",
  noHourRequirement: "No Hour Requirement",
  hourMonthlyRequirement: "{{count}} Hour Monthly Requirement",
  publisher: "Publisher",
  regularAuxiliary: "Regular Auxiliary",
  regularPioneer: "Regular Pioneer",
  circuitOverseer: "Circuit Overseer",
  specialPioneer: "Special Pioneer",
  continue: "Continue",
  neverForgetAReturnVisit: "Never Forget a Return Visit",
  neverForgetAReturnVisit_description:
    "JW Time will notify you about upcoming visits and remind you to submit your service report. You can change this later in the settings.",
  skip: "Skip",
  allowNotifications: "Allow Notifications",
  youreAllSet: "You're all set!",
  youreAllSet_description:
    "JW Time will notify you of conversations you've scheduled.",
  optInNotificationsLater:
    "You can opt-in to notifications in the settings later.",
  completeSetup: "Complete Setup",
} as const;

// Extract the type of the properties
export type LocaleWordSet = {
  [K in keyof typeof en]: string;
};

export default en;
