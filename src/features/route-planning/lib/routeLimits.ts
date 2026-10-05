// Mirrors ww-api's ROUTE_PLANNING_LIMITS; the server enforces them.

/**
 * Stops in one route, the start included when it's one of them. Keeps every
 * route to a single Google Maps link.
 */
export const MAX_ROUTE_STOPS = 10

/** Route optimizations per account in any 24 hours. */
export const MAX_DAILY_ROUTES = 10
