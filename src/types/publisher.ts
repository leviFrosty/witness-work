export const publishers = [
  "publisher",
  "regularAuxiliary",
  "regularPioneer",
  "circuitOverseer",
  "specialPioneer",
] as const;

export type Publisher = (typeof publishers)[number];

export const publisherHours = {
  publisher: 0,
  regularAuxiliary: 30,
  regularPioneer: 50,
  circuitOverseer: 70,
  specialPioneer: 90,
};
