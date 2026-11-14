import type { Hono } from 'hono'
import { Scalar } from '@scalar/hono-api-reference'
import { describeRoute, generateSpecs } from 'hono-openapi'
import type { AppEnv } from '../types'
import { componentSchemaObjects } from './schemas'

export const OPENAPI_PATH = '/openapi.json'
export const DOCS_PATH = '/docs'

const REPO_URL = 'https://github.com/leviFrosty/ww-api'

/** Tag order and blurbs; every documented route uses one of these. */
export const OPENAPI_TAGS = [
  {
    name: 'Service',
    description:
      'Liveness, the server clock, the app’s minimum version, and these docs.',
  },
  {
    name: 'Places',
    description:
      'HERE Geocoding & Search. `/geocode` and `/autocomplete` proxy HERE: the worker injects its own `apiKey` and forwards every other query parameter unchanged. `/places/v1/search` (points of interest) reads only its own parameters and shapes the answer.',
  },
  {
    name: 'Attestation',
    description:
      'Device attestation for the whole API: App Attest on iOS, Play Integrity on Android. Get a challenge, register an App Attest key, and prove the path with `verify`; each protected route then checks an assertion signed for its own `purpose`. These routes lived under `/notes-import/` until 2026-10; the old paths still work, marked deprecated.',
  },
  {
    name: 'Notes Import',
    description:
      'Turns pasted or photographed notes into contacts, visits, and time entries with a model. Every metered call is authenticated with App Attest (iOS) or Play Integrity (Android). Design: [docs/notes-import-streaming-durable-objects.md](' +
      REPO_URL +
      '/blob/main/docs/notes-import-streaming-durable-objects.md).',
  },
  {
    name: 'Scribe AI',
    description:
      'The tool-calling assistant: the app runs the loop and its own tools; each model step is one stateless bearer request streamed back as SSE, metered per account in usage units (session, weekly, and monthly windows). ww-api stores no conversation content. The wire contract is witness-work’s [docs/scribe-ai-protocol.md](https://github.com/leviFrosty/witness-work/blob/main/docs/scribe-ai-protocol.md).',
  },
  {
    name: 'Buddies',
    description:
      'End-to-end encrypted relay between buddies. The relay only sees ciphertext and random ids. Every op is `POST /buddies/v1/{op}` with a signed envelope; ids travel in bodies, never URLs. The wire contract is [docs/buddies-protocol.md](' +
      REPO_URL +
      '/blob/main/docs/buddies-protocol.md).',
  },
  {
    name: 'Accounts',
    description:
      'Anonymous accounts: a random id and a public key, nothing else. An attested session (`POST /accounts/v1/sessions`) gives bearer tokens; before sessions, ops were signed like Buddies ops under the `ww-account/v1` context, which still works while the legacy switch is on.',
  },
  {
    name: 'Shared Spaces',
    description:
      'A blind, end-to-end encrypted store shared by up to 10 members, one per shared car (witness-work ADR 0037). The server holds sealed records under random ids, members as token hashes, wrapped keys, and invites, and never learns what a space is or which accounts are on it. Every op is `POST /spaces/v1/{op}` with a bearer token; ids and member tokens travel in bodies, never URLs. The wire contract is witness-work’s [docs/shared-cars-protocol.md](https://github.com/leviFrosty/witness-work/blob/main/docs/shared-cars-protocol.md).',
  },
  {
    name: 'Passkeys',
    description:
      'Passkeys of an existing account (witness-work ADR 0038): sign in, step up a web session, and save the account key sealed under a passkey’s PRF output, which the server can’t open. A browser opens its web session with the ticket a sign-in answers. The wire contract is witness-work’s `docs/passkeys-protocol.md`.',
  },
  {
    name: 'Web sign-up',
    description:
      'Accounts on the web (witness-work ADR 0038 §5): create an account with a passkey behind Turnstile and per-network caps, or get a ticket for a web session with a recovery key.',
  },
  {
    name: 'Approving a browser',
    description:
      'A signed-in phone approves a browser by scanning its QR code (witness-work ADR 0038): the handoff with the roles turned around. The browser gets the account key sealed to it and an `approval` ticket for its web session.',
  },
  {
    name: 'Route planning',
    description:
      'Supporter-only stop ordering through HERE Waypoints Sequence. Coordinates only.',
  },
  {
    name: 'Maps',
    description:
      'MapKit JS tokens for the web app’s map, which runs in a sandboxed frame on its own origin and gets only coordinates and pin styles (witness-work ADR 0037 §8), and the OpenStreetMap house numbers inside a territory outline.',
  },
  {
    name: 'App Store',
    description: 'Public App Store data for the paywall.',
  },
  {
    name: 'Links',
    description:
      'Universal-link support: the AASA file and the no-app fallback pages for shared contacts (`/contacts`), buddy invites (`/buddies/invite`), and Set Up Another Device (`/accounts/handoff`). The short paths (`/c`, `/b`, `/h`) in links already shared are served for good.',
  },
  {
    name: 'Webhooks',
    description:
      'Called by outside services, never by the app: RevenueCat’s webhook keeps Supporter status on accounts current.',
  },
  {
    name: 'Admin',
    description:
      'Maintainer tools. Each needs `x-ww-admin-token`; without a valid token every admin route answers 404.',
  },
]

const DOCUMENTATION = {
  info: {
    title: 'WitnessWork API',
    version: '1',
    description: `The backend for the [WitnessWork](https://github.com/leviFrosty/witness-work) app: a Cloudflare Worker built with Hono. Source: [ww-api](${REPO_URL}).

**Errors.** Every JSON error uses one envelope: \`{ "ok": false, "error", "code", "retryAfter"? }\`. Read \`code\`; \`error\` repeats it, except on attestation, Notes Import, and route planning, where it is a human-readable message. Every 429 and 503 sends \`Retry-After\`.

**Signed requests.** Buddies and accounts ops send \`{ "payload", "signature" }\`: \`payload\` is the request’s fields as base64url-encoded UTF-8 JSON, and \`signature\` is an Ed25519 signature over the op’s context line followed by those exact bytes. Each op lists its decoded \`payload\` fields. Older app builds send the same values as \`p\` and \`s\` (headers \`x-buddies-p\`/\`x-buddies-s\`, \`x-ww-p\`/\`x-ww-s\`), which are still accepted.

**Rate limits.** Places, Notes Import, attestation, route planning, app config, and admin routes each count in their own per-IP bucket of 60 requests a minute. Buddies has its own per-caller tiers, documented on each op.

**CORS.** Only the web app's own origins (an exact list per environment) may call from a browser, on every route. Allowed request headers: \`authorization\`, \`content-type\`, \`if-match\`, \`if-none-match\`, \`sentry-trace\`, \`baggage\`, \`x-ww-*\`, and \`x-buddies-*\`. Exposed response headers: \`ETag\`, \`Retry-After\`, \`Date\`, \`WWW-Authenticate\`, and \`x-ww-updated-at\`. No credentials (cookies). Preflights aren't rate limited; a disallowed origin, method, or header gets 403. Browsers authenticate live sockets with \`Sec-WebSocket-Protocol\` entries (see each socket).`,
    license: { name: 'See repository', url: REPO_URL },
  },
  // The old hosts keep serving the same Workers for good (witness-work ADR
  // 0042).
  servers: [
    { url: 'https://api.witnesswork.app', description: 'Production' },
    {
      url: 'https://ww-proxy.leviwilkerson.com',
      description: 'Production (original host, still served)',
    },
    { url: 'https://api-beta.witnesswork.app', description: 'Beta' },
  ],
  tags: OPENAPI_TAGS,
  components: {
    securitySchemes: {
      adminToken: {
        type: 'apiKey' as const,
        in: 'header',
        name: 'x-ww-admin-token',
        description: 'The environment’s `ADMIN_API_TOKEN` secret.',
      },
      revenueCatWebhook: {
        type: 'http' as const,
        scheme: 'bearer',
        description:
          'The Authorization header value set on the RevenueCat webhook integration: `Bearer` and the environment’s `REVENUECAT_WEBHOOK_AUTHORIZATION` secret.',
      },
      bearerAuth: {
        type: 'http' as const,
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'An access token from `POST /accounts/v1/sessions` or `POST /accounts/v1/sessions/refresh` (a JWT, 15 minutes). A missing, expired, or invalid one is 401 `unauthorized` with `WWW-Authenticate: Bearer error="invalid_token"`; refresh once and retry.',
      },
    },
  },
}

type App = Hono<AppEnv>

/** The OpenAPI document for `app`. */
/**
 * Zod's `.int()` emits JavaScript's safe-integer range as `minimum`/`maximum`,
 * which Scalar then shows as the example value. Those bounds say nothing a
 * reader needs, so they're dropped.
 */
const dropSafeIntegerBounds = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value), (key, field) =>
    (key === 'minimum' && field === Number.MIN_SAFE_INTEGER) ||
    (key === 'maximum' && field === Number.MAX_SAFE_INTEGER)
      ? undefined
      : field
  )

export const buildOpenApiSpec = async (app: App) =>
  dropSafeIntegerBounds(
    await generateSpecs(app, {
      documentation: {
        ...DOCUMENTATION,
        components: {
          ...DOCUMENTATION.components,
          schemas: componentSchemaObjects(),
        },
      },
      // `/openapi.json` itself ends in `.json`; nothing here is a static file.
      excludeStaticFile: false,
    })
  )

/** `buildOpenApiSpec`, run once per isolate (a failure retries next time). */
const specFor = (app: App) => {
  let spec: ReturnType<typeof buildOpenApiSpec> | undefined
  return () => {
    spec ??= buildOpenApiSpec(app).catch((error) => {
      spec = undefined
      throw error
    })
    return spec
  }
}

/**
 * Mounts `/openapi.json` (the document) and `/docs` (Scalar's reference UI)
 * on `app`. Call after every other route, so all of them are in the document.
 */
export const mountApiDocs = (app: App) => {
  const spec = specFor(app)
  app.get(
    OPENAPI_PATH,
    describeRoute({
      tags: ['Service'],
      summary: 'OpenAPI document',
      description:
        'This API’s OpenAPI 3.1 document, generated from the routes the worker serves.',
      responses: { 200: { description: 'The OpenAPI document.' } },
    }),
    async (c) =>
      c.json(await spec(), 200, { 'Cache-Control': 'public, max-age=300' })
  )
  app.get(
    DOCS_PATH,
    describeRoute({
      tags: ['Service'],
      summary: 'API reference',
      description: 'This reference, rendered by Scalar from `/openapi.json`.',
      responses: { 200: { description: 'An HTML page.' } },
    }),
    Scalar({
      url: OPENAPI_PATH,
      pageTitle: 'WitnessWork API',
      layout: 'modern',
      // No hosted AI chat, telemetry, or SDK upsell toolbar on our page.
      agent: { disabled: true },
      telemetry: false,
      showDeveloperTools: 'never',
    })
  )
  return app
}
