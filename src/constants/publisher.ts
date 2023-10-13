import { PublisherHours } from "./../types/publisher";
export const publishers = [
  "publisher",
  "regularAuxiliary",
  "regularPioneer",
  "circuitOverseer",
  "specialPioneer",
] as const;

export const publisherHours: PublisherHours = {
  publisher: 0,
  regularAuxiliary: 30,
  regularPioneer: 50,
  circuitOverseer: 70,
  specialPioneer: 90,
};
