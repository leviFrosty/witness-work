import { z } from 'zod'
import { describeRoute } from 'hono-openapi'
import {
  errorResponse,
  jsonBody,
  jsonResponse,
  rateLimitedResponse,
  serverErrorResponse,
} from './schemas'

/**
 * OpenAPI descriptions for the routes registered directly in `src/index.ts`.
 * Feature route groups keep theirs in their own `openapi.ts`.
 */

const html = (description: string) => ({
  description,
  content: { 'text/html': { schema: { type: 'string' as const } } },
})

export const healthDocs = describeRoute({
  tags: ['Service'],
  summary: 'Health and server clock',
  description:
    'Liveness plus the server clock. Clients calibrate against `Date` (and `serverTime`) before signing time-bound requests such as Buddies `ts`, so the response is never cached. No rate limit.',
  responses: {
    200: jsonResponse(
      'The worker is up.',
      z.object({
        status: z.literal('ok'),
        timestamp: z.string().meta({
          description: 'Server time (ISO 8601).',
          format: 'date-time',
        }),
        serverTime: z
          .number()
          .int()
          .meta({ description: 'The same instant in epoch milliseconds.' }),
        versionId: z
          .string()
          .meta({ description: 'Deployed Worker version id.' }),
        versionTag: z
          .string()
          .optional()
          .meta({ description: 'Version tag, when one was set at upload.' }),
        deployedAt: z.string().meta({
          description: 'When this Worker version was uploaded (ISO 8601).',
          format: 'date-time',
        }),
      })
    ),
  },
})

export const appConfigDocs = describeRoute({
  tags: ['Service'],
  summary: 'App configuration',
  description:
    'What the app reads at launch and when it returns to the foreground. Below `minAppVersion` it shows a blocking Update Required screen with a store link. From KV `app:min-version` (`{"minVersion":"1.42.0"}`), then the `APP_MIN_VERSION` var (the KV read is edge-cached for 60 seconds; the response is `no-store`). Also Cloud Sync’s switches (`sync`), web sign-up’s (`webSignup`), and the caller’s coarse location (`country`, `regionCode`) for the app’s sales-region check. Query `capabilities` (comma-separated, for example `sync-everyone`): what the app does, as on session open. No authentication.',
  responses: {
    200: jsonResponse(
      'The configuration.',
      z.object({
        ok: z.literal(true),
        minAppVersion: z
          .string()
          .regex(/^\d+\.\d+\.\d+$/)
          .optional()
          .meta({
            description:
              'The oldest app version (`major.minor.patch`) the API still supports. Absent without a floor.',
          }),
        sync: z
          .object({
            enabled: z.boolean().meta({
              description:
                'Whether Cloud Sync is on (KV `sync:enabled`, then the `SYNC_ENABLED` var; false on a worker without its bucket or the accounts database).',
            }),
            entitlement: z.enum(['supporter', 'everyone']).meta({
              description:
                'Who gets it: Supporters, or everyone (KV `sync:entitlement`, then the `SYNC_ENTITLEMENT` var, else `everyone`; witness-work ADR 0040). `everyone` only when `?capabilities=` has `sync-everyone`; otherwise `supporter`.',
            }),
          })
          .meta({
            description:
              'Cloud Sync’s switches (witness-work ADR 0030), so a device without a session knows whether opening one would get it Cloud Sync. `GET /accounts/v1/sync` gives the account’s own answer.',
          }),
        webSignup: z
          .object({
            enabled: z.boolean().meta({
              description:
                'Whether web sign-up is open (KV `accounts:web-signup`, then the `WEB_SIGNUP` var; a failed KV read counts as on). False on a worker without the accounts database, passkeys, or Turnstile. While false, the web says sign-up is paused.',
            }),
            turnstileSiteKey: z.string().nullable().meta({
              description:
                'The Turnstile site key for the web’s sign-up and recovery widgets (Cloudflare’s test key on development workers without one). Present even while sign-up is off, since recovery uses it too; null without Turnstile.',
            }),
          })
          .meta({ description: 'Web sign-up’s switch and Turnstile site key.' }),
        country: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .nullable()
          .meta({
            description:
              'The caller’s country (ISO 3166-1 alpha-2, upper case) from Cloudflare’s `request.cf.country`, for the app’s sales-region check (witness-work ADR 0041 §3). Null when unknown (`XX`), Tor (`T1`), or malformed. Coarse location only; never stored or logged.',
            example: 'CA',
          }),
        regionCode: z
          .string()
          .regex(/^[A-Z0-9]{1,3}$/)
          .nullable()
          .meta({
            description:
              'The caller’s subdivision from `request.cf.regionCode`: its ISO 3166-2 code without the country prefix, upper case (`MB` for Manitoba). Null when unknown or malformed, and whenever `country` is null. Null means the subdivision is unknown, not that it’s outside any rule: the web app treats `CA` with a null `regionCode` as possibly Manitoba or Saskatchewan and doesn’t sell there. Coarse location only; never stored or logged.',
            example: 'MB',
          }),
      })
    ),
    ...rateLimitedResponse,
  },
})

const hereQuery = (extra: string) => [
  {
    name: 'q',
    in: 'query' as const,
    required: true,
    schema: { type: 'string' as const },
    description: extra,
  },
]

const hereResponses = {
  200: {
    description:
      'HERE’s response body, passed through unchanged with HERE’s status.',
    content: { 'application/json': { schema: { type: 'object' as const } } },
  },
  400: errorResponse(
    'HERE rejected the query. HERE’s own error fields are kept beside the envelope.',
    ['bad_request']
  ),
  ...rateLimitedResponse,
  502: errorResponse('HERE was unreachable or answered with a non-JSON body.', [
    'upstream_error',
  ]),
}

export const geocodeDocs = describeRoute({
  tags: ['Places'],
  summary: 'Geocode an address',
  description:
    'Proxies [HERE Geocode](https://www.here.com/docs/bundle/geocoding-and-search-api-developer-guide/page/topics-api/code-geocode-address.html). Every HERE query parameter is accepted; any `apiKey` the client sends is removed and replaced with the worker’s.',
  parameters: hereQuery('The address to geocode.'),
  responses: hereResponses,
})

export const autocompleteDocs = describeRoute({
  tags: ['Places'],
  summary: 'Autocomplete an address',
  description:
    'Proxies [HERE Autocomplete](https://www.here.com/docs/bundle/geocoding-and-search-api-developer-guide/page/topics/endpoint-autocomplete-brief.html). Every HERE query parameter (`limit`, `in`, `lang`, …) is accepted; any `apiKey` the client sends is removed and replaced with the worker’s.',
  parameters: hereQuery('The partial address typed so far.'),
  responses: hereResponses,
})

export const appStoreRatingsDocs = describeRoute({
  tags: ['App Store'],
  summary: 'App Store rating totals',
  description:
    'Paywall social proof: ratings summed across all 175 App Store storefronts. An hourly cron sweeps 40 storefronts a run and publishes a new summary once a week. Served from the edge cache (`s-maxage` 6 h).',
  responses: {
    200: jsonResponse(
      'The latest completed sweep.',
      z.object({
        averageRating: z.number().meta({
          description:
            'Rating-count-weighted mean across storefronts, rounded to 2 decimals.',
        }),
        ratingCount: z.number().int(),
        countryCount: z
          .number()
          .int()
          .meta({ description: 'Storefronts with at least one rating.' }),
        updatedAt: z.string().meta({ format: 'date-time' }),
      })
    ),
    503: errorResponse(
      'No sweep has completed yet (a fresh deploy). `Retry-After: 3600`.',
      ['unavailable']
    ),
  },
})

export const aasaDocs = describeRoute({
  tags: ['Links'],
  summary: 'Apple App Site Association',
  description:
    'Tells iOS which paths open the app, for the App Store, Beta, and development bundle ids: `/contacts#…` (shared contacts), `/buddies/invite#1…` (buddy invites), and `/accounts/handoff#1…` (Set Up Another Device), plus the short paths in links already shared (`/c#…`, `/c/…`, `/b#1…`, `/h#1…`), which stay for good.',
  responses: {
    200: {
      description: 'The AASA document.',
      content: {
        'application/json': {
          schema: { type: 'object' as const },
          example: {
            applinks: {
              details: [
                {
                  appIDs: ['TEAMID.com.leviwilkerson.jwtime'],
                  components: [
                    { '/': '/contacts', '#': '?*' },
                    { '/': '/buddies/invite', '#': '1?*' },
                    { '/': '/accounts/handoff', '#': '1?*' },
                    { '/': '/c', '#': '?*' },
                    { '/': '/c/*' },
                    { '/': '/b', '#': '1?*' },
                    { '/': '/h', '#': '1?*' },
                  ],
                },
              ],
            },
          },
        },
      },
    },
    ...serverErrorResponse,
  },
})

const langParameter = {
  name: 'lang',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const },
  description: 'Page language. Falls back to `Accept-Language`, then English.',
}

/**
 * A link page's short path (`/c`, `/b`, `/h`): the same page, in links people
 * already sent. Served for good; new links use the readable path.
 */
const shortPathDocs = (
  path: string,
  summary: string,
  description: string,
  response: string,
  parameters: (typeof langParameter)[] = []
) =>
  describeRoute({
    tags: ['Links'],
    summary: `${summary} (short path)`,
    description: `The same page as \`${path}\`, at the short path older app versions put in links. Those links are already in people’s messages, so this path is served for good; new links use \`${path}\`.\n\n${description}`,
    deprecated: true,
    parameters,
    responses: { 200: html(response) },
  })

const CONTACT_LINK_DESCRIPTION =
  'Shown when someone opens a shared-contact link without the app. The contact rides in the URL fragment (`/contacts#<payload>`), which never reaches the worker; the page’s script turns it into an “Open app” link.'

export const contactLinkDocs = describeRoute({
  tags: ['Links'],
  summary: 'Shared contact fallback page',
  description: CONTACT_LINK_DESCRIPTION,
  parameters: [langParameter],
  responses: { 200: html('A localized landing page.') },
})

export const shortContactLinkDocs = shortPathDocs(
  '/contacts',
  'Shared contact fallback page',
  CONTACT_LINK_DESCRIPTION,
  'A localized landing page.',
  [langParameter]
)

export const legacyContactLinkDocs = describeRoute({
  tags: ['Links'],
  summary: 'Shared contact fallback page (legacy)',
  description:
    'The same page for links shared by the oldest app versions, which put the payload in the path. Served for good, like `/c`. The payload only ever goes into the “Open app” link, never into meta tags.',
  deprecated: true,
  parameters: [
    {
      name: 'payload',
      in: 'path' as const,
      required: true,
      schema: { type: 'string' as const },
      description: 'The base64url contact payload.',
    },
    langParameter,
  ],
  responses: { 200: html('A localized landing page.') },
})

const BUDDY_INVITE_DESCRIPTION =
  'Shown when someone opens a buddy invite (`/buddies/invite#1<secret>`) without the app, with App Store and Google Play buttons. The invite secret stays in the fragment and never reaches the worker.'

export const buddyInvitePageDocs = describeRoute({
  tags: ['Links'],
  summary: 'Buddy invite fallback page',
  description: BUDDY_INVITE_DESCRIPTION,
  responses: { 200: html('The invite landing page.') },
})

export const shortBuddyInvitePageDocs = shortPathDocs(
  '/buddies/invite',
  'Buddy invite fallback page',
  BUDDY_INVITE_DESCRIPTION,
  'The invite landing page.'
)

const HANDOFF_DESCRIPTION =
  'Shown when a phone’s camera opens a Set Up Another Device QR code (`/accounts/handoff#1<…>`) instead of WitnessWork: install or open the app on the new phone and scan the code from inside it, with App Store and Google Play buttons. Localized like `/contacts` (`?lang=`, then `Accept-Language`). The handoff secret stays in the fragment and never reaches the worker.'

export const handoffPageDocs = describeRoute({
  tags: ['Links'],
  summary: 'Set Up Another Device fallback page',
  description: HANDOFF_DESCRIPTION,
  parameters: [langParameter],
  responses: { 200: html('The handoff landing page.') },
})

export const shortHandoffPageDocs = shortPathDocs(
  '/accounts/handoff',
  'Set Up Another Device fallback page',
  HANDOFF_DESCRIPTION,
  'The handoff landing page.',
  [langParameter]
)

export const notesImportAdminResetDocs = describeRoute({
  tags: ['Admin'],
  summary: 'Reset a Notes Import meter',
  description:
    'Resets one meter’s rolling allowance and its Empty Import rows, keeping permanent replay and refinement records. Used by `pnpm run admin:reset-usage --notes-import`; answers only while KV `scribe:legacy-notes-import` is on.',
  security: [{ adminToken: [] }],
  requestBody: jsonBody(
    z.object({
      meterId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{8,64}$/)
        .meta({
          description: 'The account id, or the install id without an account.',
        }),
    })
  ),
  responses: {
    200: jsonResponse('Reset.', z.object({ ok: z.literal(true) })),
    400: errorResponse('Invalid JSON or `meterId`.', ['bad_request']),
    404: errorResponse('Missing or wrong admin token.', ['not_found']),
    ...rateLimitedResponse,
  },
})
