import { publishers } from "../constants/publisher";

export type Publisher = (typeof publishers)[number];

export type PublisherHours = Record<Publisher, number>;
