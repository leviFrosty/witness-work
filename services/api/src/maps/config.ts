export const MAPS_LIMITS = {
  /**
   * A MapKit JS token's lifetime. MapKit JS asks for a new one through its
   * `authorizationCallback` when it expires, so short costs only a request
   * every half hour per open map.
   */
  tokenLifetimeSeconds: 30 * 60,
  /**
   * Tokens per account in any rolling minute. A page load asks once; several
   * tabs, reloads, and a retry fit well inside.
   */
  tokenMinuteLimit: 10,
  /**
   * Tokens per account in any rolling 24 hours: an open map renews 48 times a
   * day, so this is ten all-day tabs' worth with room for reloads.
   */
  tokenDailyLimit: 500,
  /** `{ "origin": "…" }` is well under this. */
  maxTokenBodyBytes: 1024,
} as const

export const PLACE_SEARCH_LIMITS = {
  /** Longer than any name or address a person types. */
  maxQueryLength: 200,
  /** The native place field shows five suggestions. */
  defaultResults: 5,
  maxResults: 20,
  /**
   * Decimals of `at` sent to HERE: 4 is about 11 m, plenty to rank nearby
   * places, and no more precise than that.
   */
  atDecimals: 4,
  /** Discover answers in well under a second. */
  hereTimeoutMs: 8_000,
} as const

export const TERRITORY_ADDRESS_LIMITS = {
  /** 200 points at about 45 bytes each, with room for whitespace. */
  maxBodyBytes: 16 * 1024,
  minOutlinePoints: 3,
  /** More than a hand-drawn territory has; keeps the Overpass query short. */
  maxOutlinePoints: 200,
  /**
   * The outline's bounding box, each side. A territory is a few blocks to a
   * neighborhood; anything larger is a heavy Overpass query for one request.
   */
  maxSideMeters: 3_000,
  /** Decimals sent to Overpass and in answers: 5 is about 1 m. */
  coordinateDecimals: 5,
  /** A house number or unit label longer than this isn't one. */
  maxNumberLength: 12,
  /** Longer than any real street or place name. */
  maxStreetLength: 200,
  /** Thousands of homes is already more than one territory holds. */
  maxAddresses: 3_000,
  /** Searches per account in any rolling minute: a few retries and redraws. */
  minuteLimit: 6,
  /** Searches per account in any rolling 24 hours. */
  dailyLimit: 60,
  /**
   * How long to wait for Overpass. `[timeout:25]` bounds only the query's
   * run; a busy public instance first holds it in its queue. Measured on
   * overpass-api.de under load: answers in 26–48 s, and its own 504 at
   * about 57 s. Waiting longer than that buys nothing.
   */
  overpassTimeoutMs: 55_000,
  /** The query's server-side limit in seconds. */
  overpassQueryTimeoutSeconds: 25,
  /** OSM address points change slowly; a week saves Overpass repeat work. */
  cacheSeconds: 7 * 24 * 60 * 60,
  /** Overpass didn't say how long to wait. */
  busyRetryAfterSeconds: 60,
} as const

/** overpass-api.de's main instance. Override with `OVERPASS_URL`. */
export const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

/** overpass-api.de answers 406 to requests without a descriptive agent. */
export const OVERPASS_USER_AGENT =
  'WitnessWork-API/1.0 (+https://witnesswork.app)'
