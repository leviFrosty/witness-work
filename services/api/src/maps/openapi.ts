import { z } from 'zod'
import { describeRoute } from 'hono-openapi'
import {
  apiErrorSchema,
  errorResponse,
  json,
  jsonResponse,
} from '../openapi/schemas'
import {
  MAPS_LIMITS,
  PLACE_SEARCH_LIMITS,
  TERRITORY_ADDRESS_LIMITS,
} from './config'

const TOKEN_MINUTES = MAPS_LIMITS.tokenLifetimeSeconds / 60

export const mapKitTokenDocs = describeRoute({
  tags: ['Maps'],
  summary: 'Mint a MapKit JS token',
  description: `A short-lived [MapKit JS](https://developer.apple.com/documentation/mapkitjs) token for the web app’s map frame (witness-work ADR 0037 §8). The web app fetches it with its session and posts it to the frame, which returns it from MapKit JS’s \`authorizationCallback\`; MapKit JS asks again when it expires.

The token is an ES256 JWT signed with the worker’s MapKit JS key: header \`{ alg: "ES256", kid, typ: "JWT" }\`, claims \`{ iss, iat, exp, origin, scope: "mapkit_js" }\`. \`iss\` is the Apple team id, \`exp\` is ${TOKEN_MINUTES} minutes after \`iat\`, and \`origin\` is the frame’s origin, so Apple accepts it only on that page.

**Bearer only** (\`Authorization: Bearer <accessToken>\`, from \`POST /accounts/v1/sessions\`), for any account; a suspended account is refused. Limits: ${MAPS_LIMITS.tokenMinuteLimit} tokens per account in any rolling minute and ${MAPS_LIMITS.tokenDailyLimit} in any rolling 24 hours, plus the per-IP limit.

Each worker allows its own frame origins (\`MAPKIT_JS_ORIGINS\`): production \`https://maps.witnesswork.app\`, Beta \`https://maps-beta.witnesswork.app\` (a local development worker borrows it, and names a local \`http://localhost:<port>\` frame only under \`wrangler dev\`), and \`origin\` must match one exactly. Until the MapKit JS key is configured, every request with a valid token answers 503 \`maps_unconfigured\`.

The body is optional: send none, \`{}\`, or \`{ "origin": "…" }\` to pick one of the allowed origins. At most ${MAPS_LIMITS.maxTokenBodyBytes} bytes.`,
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: false,
    content: json(
      z
        .object({
          origin: z.string().optional().meta({
            description:
              'The map frame’s exact origin, one this worker allows. Defaults to its first.',
          }),
        })
        .strict()
    ),
  },
  responses: {
    200: jsonResponse(
      'A fresh token. `Cache-Control: no-store`.',
      z.object({
        ok: z.literal(true),
        token: z.string().meta({
          description: 'The JWT to give MapKit JS.',
        }),
        origin: z.string().meta({
          description: 'The `origin` claim: the frame origin it works on.',
        }),
        expiresAt: z.number().int().meta({
          description: 'The `exp` claim in epoch ms.',
        }),
      })
    ),
    400: errorResponse(
      'Invalid JSON or an unknown field (`bad_request`), or an origin this worker doesn’t allow (`origin_not_allowed`).',
      ['bad_request', 'origin_not_allowed']
    ),
    401: errorResponse(
      'The access token is missing, expired, or invalid (`WWW-Authenticate: Bearer error="invalid_token"`; refresh once and retry).',
      ['unauthorized']
    ),
    403: errorResponse('The account is suspended.', ['suspended']),
    413: errorResponse('Body too large.', ['too_large']),
    429: errorResponse(
      'The per-account minute (`rate_limited`) or daily (`daily_limit`) limit, or the per-IP limit (`rate_limited`). `Retry-After` says when the next token fits.',
      ['rate_limited', 'daily_limit']
    ),
    500: errorResponse('Unexpected failure.', ['internal', 'server_error']),
    503: errorResponse(
      'The MapKit JS key, its id, the team id, or a frame origin isn’t configured on this worker (`maps_unconfigured`, `Retry-After: 60`), or accounts are off (`disabled`).',
      ['maps_unconfigured', 'disabled']
    ),
  },
})

const placeAddress = z.object({
  label: z.string().meta({
    description:
      'The postal address on one line, formatted for its country. For a point of interest, HERE’s leading name is cut (it’s in `name`).',
  }),
  houseNumber: z.string().optional(),
  street: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  stateCode: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z
    .string()
    .optional()
    .meta({ description: 'ISO 3166-1 alpha-3.' }),
  countryName: z.string().optional(),
})

const placeItem = z
  .object({
    id: z.string().meta({ description: 'HERE’s id for the result.' }),
    name: z.string().optional().meta({
      description:
        'The place’s name, for points of interest only; an address result has none.',
    }),
    category: z
      .object({
        id: z.string().meta({ description: 'HERE category id.' }),
        name: z.string(),
      })
      .optional()
      .meta({ description: 'The place’s primary HERE category.' }),
    address: placeAddress,
    latitude: z.number(),
    longitude: z.number(),
    distanceMeters: z.number().int().optional().meta({
      description: 'Straight-line distance from `at`.',
    }),
  })
  .meta({ id: 'PlaceSearchItem' })

export const placeSearchDocs = describeRoute({
  tags: ['Places'],
  summary: 'Search places and points of interest',
  description: `Points of interest and addresses matching \`q\`, ranked near \`at\`, from [HERE Discover](https://www.here.com/docs/bundle/geocoding-and-search-api-developer-guide/page/topics/endpoint-discover-brief.html) (one HERE transaction per request). The web app’s place field uses it where MapKit’s native search isn’t available (witness-work ADR 0037 §8).

Unlike \`/geocode\` and \`/autocomplete\`, it doesn’t pass HERE through: only \`q\`, \`at\`, \`limit\`, and \`lang\` are read (every other parameter is ignored), \`at\` reaches HERE rounded to ${PLACE_SEARCH_LIMITS.atDecimals} decimals, and each result keeps only its id, name, category, address, and position.

Public, with no session, and counted in the same per-IP \`places\` bucket as \`/geocode\` and \`/autocomplete\`. Nothing found is 200 with no items. \`Cache-Control: no-store\`.

The parameters keep HERE’s and \`/autocomplete\`’s names (\`q\`, \`at\`, \`lang\`) on purpose: clients already build them for the HERE routes, and the worker’s Sentry redaction already cuts \`q\` and \`at\` from every recorded URL.`,
  parameters: [
    {
      name: 'q',
      in: 'query',
      required: true,
      schema: {
        type: 'string',
        minLength: 1,
        maxLength: PLACE_SEARCH_LIMITS.maxQueryLength,
      },
      description: 'What the user typed: a name, a kind of place, or an address.',
    },
    {
      name: 'at',
      in: 'query',
      required: true,
      schema: { type: 'string', example: '39.1031,-84.5120' },
      description: '`<latitude>,<longitude>` to rank results near.',
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: {
        type: 'integer',
        minimum: 1,
        maximum: PLACE_SEARCH_LIMITS.maxResults,
        default: PLACE_SEARCH_LIMITS.defaultResults,
      },
      description: 'The most results to return.',
    },
    {
      name: 'lang',
      in: 'query',
      required: false,
      schema: { type: 'string', example: 'en-US' },
      description: 'BCP 47 language for names and addresses.',
    },
  ],
  responses: {
    200: jsonResponse(
      'The results, best first.',
      z.object({ ok: z.literal(true), items: z.array(placeItem) })
    ),
    400: errorResponse(
      'A missing or invalid parameter (`field` names it: `q`, `at`, `limit`, or `lang`), or HERE refused the query.',
      ['bad_request'],
      apiErrorSchema
        .extend({
          field: z.enum(['q', 'at', 'limit', 'lang']).optional(),
        })
        .meta({ id: 'PlaceSearchError' })
    ),
    429: errorResponse(
      'Too many requests from this IP in the last minute (`Retry-After: 60`), or HERE is limiting the worker (`Retry-After` from HERE, else 60).',
      ['rate_limited']
    ),
    502: errorResponse(
      'HERE was unreachable, timed out, refused the worker’s key, or answered with something unreadable.',
      ['upstream_error']
    ),
  },
})

const ADDRESS_LIMITS = TERRITORY_ADDRESS_LIMITS
const CACHE_DAYS = ADDRESS_LIMITS.cacheSeconds / (24 * 60 * 60)

const territoryAddress = z
  .object({
    street: z.string().meta({
      description:
        'The street (`addr:street`), or the place (`addr:place`) for an address with no street, as OpenStreetMap writes it, trimmed.',
      example: 'Hayes Street',
    }),
    number: z.string().meta({
      description: `One house number, trimmed, at most ${ADDRESS_LIMITS.maxNumberLength} characters. A multi-value tag (\`629;631\`, \`629,631\`) is one entry per number at the same point. Not always numeric (\`12A\`, \`1-3\`).`,
      example: '629',
    }),
    latitude: z.number().meta({
      description: `The address point, or the building’s center, rounded to ${ADDRESS_LIMITS.coordinateDecimals} decimals.`,
    }),
    longitude: z.number(),
  })
  .meta({ id: 'TerritoryAddress' })

export const territoryAddressesDocs = describeRoute({
  tags: ['Maps'],
  summary: 'List house numbers inside a territory outline',
  description: `Every [OpenStreetMap](https://www.openstreetmap.org/copyright) element with an \`addr:housenumber\` inside the outline, from the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API), so the app can prefill each street’s house numbers. Apple’s and HERE’s geocoders return only the nearest address to a point, so neither can list a street’s houses.

Coverage follows OpenStreetMap: dense where address points are mapped (a San Francisco block lists 20 or more a street), none where they aren’t. An empty \`addresses\` is a normal answer; the app keeps its own behavior then. Show \`attribution\` wherever the numbers appear.

**Bearer only** (\`Authorization: Bearer <accessToken>\`, from \`POST /accounts/v1/sessions\`), for any account; a suspended account is refused. Limits: ${ADDRESS_LIMITS.minuteLimit} searches per account in any rolling minute and ${ADDRESS_LIMITS.dailyLimit} in any rolling 24 hours, plus the per-IP \`maps\` limit. A cached answer still counts.

The outline is ${ADDRESS_LIMITS.minOutlinePoints}–${ADDRESS_LIMITS.maxOutlinePoints} points in order (closing the ring by repeating the first is optional), and its bounding box at most ${ADDRESS_LIMITS.maxSideMeters / 1000} km on each side. Overpass receives it rounded to ${ADDRESS_LIMITS.coordinateDecimals} decimals, in a form POST body, and never the account. The answer is kept in the worker’s edge cache for ${CACHE_DAYS} days under a SHA-256 of the rounded outline, so searching the same territory again doesn’t ask Overpass. Nothing logs the outline, the coordinates, or the account.

Overpass’s public instance can take tens of seconds under load (the worker waits up to ${ADDRESS_LIMITS.overpassTimeoutMs / 1000} s), so give the request a long timeout and treat \`upstream_busy\` as “try again later”.

Each street and number appears once (the first one found), in OpenStreetMap’s order, at most ${ADDRESS_LIMITS.maxAddresses}. Elements with neither \`addr:street\` nor \`addr:place\` are skipped. At most ${ADDRESS_LIMITS.maxBodyBytes / 1024} KiB of body.`,
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: json(
      z
        .object({
          outline: z
            .array(
              z
                .object({
                  latitude: z.number().min(-90).max(90),
                  longitude: z.number().min(-180).max(180),
                })
                .strict()
            )
            .min(ADDRESS_LIMITS.minOutlinePoints)
            .max(ADDRESS_LIMITS.maxOutlinePoints)
            .meta({
              description: 'The territory’s boundary, in decimal degrees.',
            }),
        })
        .strict()
    ),
  },
  responses: {
    200: jsonResponse(
      'The address points. `Cache-Control: no-store`.',
      z.object({
        ok: z.literal(true),
        source: z.literal('openstreetmap'),
        attribution: z.literal('© OpenStreetMap contributors').meta({
          description: 'Show it wherever the numbers appear (ODbL).',
        }),
        addresses: z.array(territoryAddress),
      })
    ),
    400: errorResponse(
      'Invalid JSON, an unknown field, or a bad outline: too few or too many points, or a coordinate out of range. `field` is `outline` for the outline and `body` otherwise.',
      ['bad_request'],
      apiErrorSchema
        .extend({ field: z.enum(['body', 'outline']).optional() })
        .meta({ id: 'TerritoryAddressError' })
    ),
    401: errorResponse(
      'The access token is missing, expired, or invalid (`WWW-Authenticate: Bearer error="invalid_token"`; refresh once and retry).',
      ['unauthorized']
    ),
    403: errorResponse('The account is suspended.', ['suspended']),
    413: errorResponse(
      `Body too large (\`too_large\`), or the outline’s bounding box is over ${ADDRESS_LIMITS.maxSideMeters / 1000} km on a side (\`area_too_large\`).`,
      ['too_large', 'area_too_large']
    ),
    429: errorResponse(
      'The per-account minute (`rate_limited`) or daily (`daily_limit`) limit, or the per-IP limit (`rate_limited`). `Retry-After` says when the next search fits.',
      ['rate_limited', 'daily_limit']
    ),
    500: errorResponse('Unexpected failure.', ['internal', 'server_error']),
    502: errorResponse(
      'Overpass was unreachable, failed, or answered with something unreadable.',
      ['upstream_error']
    ),
    503: errorResponse(
      `Overpass is busy (\`upstream_busy\`: it answered 429, 502, 503, or 504, its query ran out of time, or it didn’t answer within ${ADDRESS_LIMITS.overpassTimeoutMs / 1000} s; \`Retry-After\` from Overpass, else ${ADDRESS_LIMITS.busyRetryAfterSeconds}), or accounts are off (\`disabled\`).`,
      ['upstream_busy', 'disabled']
    ),
  },
})
