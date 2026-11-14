export const HERE_API = {
  GEOCODE_URL: 'https://geocode.search.hereapi.com/v1/geocode',
  AUTOCOMPLETE_URL: 'https://autocomplete.search.hereapi.com/v1/autocomplete',
  DISCOVER_URL: 'https://discover.search.hereapi.com/v1/discover',
  WAYPOINTS_SEQUENCE_URL: 'https://wps.hereapi.com/v8/findsequence2',
  ROUTES_URL: 'https://router.hereapi.com/v8/routes',
  API_KEY_PARAM: 'apiKey',
} as const;

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;
