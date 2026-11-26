import * as Sentry from '@sentry/cloudflare';
import type { Breadcrumb, CloudflareOptions, Event } from '@sentry/cloudflare';
import { DrizzleQueryError } from 'drizzle-orm';
import type { Context } from 'hono';
import { routePath } from 'hono/route';
import type { Environment } from './types';

/**
 * Contact links shared by older app versions carry the whole contact
 * (gzip + base64url) in the path: `/c/<payload>`. The SDK copies request URLs
 * into many places (`event.request`, the Referer header, `url.full` span data,
 * transaction names, breadcrumbs), so rather than chase each field, every
 * string in an outgoing event is scrubbed. Route patterns (`/c/:payload`) are
 * left alone so parameterized transaction names survive.
 */
const CONTACT_LINK_PAYLOAD_PATH = /\/c\/(?!:)[^\s?#"'<>]+/g;
const REDACTED_CONTACT_LINK_PATH = '/c/[redacted]';

export function redactContactLinkPayloads(value: string): string {
  return value.replace(CONTACT_LINK_PAYLOAD_PATH, REDACTED_CONTACT_LINK_PATH);
}

/**
 * Query parameters that carry a credential or the user's data: Notes Import's
 * legacy run routes (`/notes-import/:importId/events|result|cancel|destroy`)
 * take their subscribe token as `?token=`, and the HERE proxy drops a
 * client-sent `apiKey` for its own. The HERE proxy (`/geocode`,
 * `/autocomplete`) also takes what the user typed, often a contact's address,
 * as `q` or `qq`, and the user's location as `at` or `in`. The SDK records the
 * request URL whole (`event.request.url` and `query_string`, `url.full` span
 * data, the Referer header, breadcrumbs), and Notes Import traces at 100%
 * (everything else at 10%), so their values are cut from every string in an
 * event, like contact links. Names are lowercase and match without regard to
 * case.
 *
 * A name is compared as the worker reads it: Hono and `URLSearchParams`
 * decode percent-escapes (and `+`) in names, so `?to%6Ben=` is a `token`
 * too. The raw name stays in the string; only the value is cut.
 */
const SECRET_QUERY_PARAMETERS = ['token', 'apikey', 'q', 'qq', 'at', 'in'];
/**
 * A query parameter's `name=` at the start of a string or after `?` or `&`.
 * It matches only up to the `=`, so a parameter inside another one's value
 * (`?next=/x?token=…`) is found as well.
 */
const QUERY_PARAMETER_NAME = /(?:^|[?&])([^&#=?\s"'<>]*)=/g;
/**
 * A value runs to the next `&` or the fragment, or to whatever ends the URL
 * in the string (whitespace, a quote, an angle bracket, the string's end).
 */
const QUERY_PARAMETER_VALUE = /[^&#\s"'<>]*/y;
const REDACTED_QUERY_VALUE = '[redacted]';

/**
 * A raw query parameter name decoded as `URLSearchParams` decodes it: `+` is
 * a space, and percent-escapes are decoded, a malformed one left as it is
 * (never an error).
 */
function decodeQueryParameterName(name: string): string {
  if (!/[%+]/.test(name)) return name;
  for (const [decoded] of new URLSearchParams(`${name}=`)) return decoded;
  return name;
}

const isSecretQueryParameter = (name: string): boolean =>
  SECRET_QUERY_PARAMETERS.includes(
    decodeQueryParameterName(name).toLowerCase()
  );

export function redactSecretQueryParameters(value: string): string {
  let redacted = '';
  let copied = 0;
  for (const match of value.matchAll(QUERY_PARAMETER_NAME)) {
    // A name inside a value that was just cut is gone with it.
    if (match.index < copied || !isSecretQueryParameter(match[1])) continue;
    const valueStart = match.index + match[0].length;
    QUERY_PARAMETER_VALUE.lastIndex = valueStart;
    QUERY_PARAMETER_VALUE.exec(value);
    redacted += value.slice(copied, valueStart) + REDACTED_QUERY_VALUE;
    copied = QUERY_PARAMETER_VALUE.lastIndex;
  }
  return copied === 0 ? value : redacted + value.slice(copied);
}

/**
 * Drizzle's query errors carry the SQL and its bound parameters (account ids,
 * session ids, refresh token hashes, inbox ids) in their message, as
 * `Failed query: <sql>\nparams: <values>`, and D1's own error in `cause`. D1's
 * messages (`D1_ERROR: …`, `D1_TYPE_ERROR: …`) can quote a value too.
 */
const DATABASE_ERROR_TEXT = /Failed query:|\nparams:|\bD1_[A-Z_]+:/;
const REDACTED_DATABASE_ERROR = '[redacted database query]';

/** Cuts everything from a database error's text onwards. */
export function redactDatabaseErrors(value: string): string {
  const match = DATABASE_ERROR_TEXT.exec(value);
  return match
    ? `${value.slice(0, match.index)}${REDACTED_DATABASE_ERROR}`
    : value;
}

const isDatabaseErrorItself = (error: unknown): boolean =>
  error instanceof DrizzleQueryError ||
  (error instanceof Error && DATABASE_ERROR_TEXT.test(error.message));

/** A database error, or an error caused (at any depth) by one. */
export function isDatabaseError(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let at = error; at != null && !seen.has(at); ) {
    if (isDatabaseErrorItself(at)) return true;
    seen.add(at);
    at = (at as { cause?: unknown }).cause;
  }
  return false;
}

/** A database failure as it's reported: which operation, nothing from the query. */
export class DatabaseError extends Error {
  override name = 'DatabaseError';
}

/** A failure reported as its operation alone (`captureOperationFailure`). */
export class OperationError extends Error {
  override name = 'OperationError';
}

/** `reported`, carrying `error`'s stack frames but none of its text. */
function withFramesOf<T extends Error>(reported: T, error: unknown): T {
  const stack = error instanceof Error ? (error.stack ?? '') : '';
  const frames = stack.split('\n').filter((line) => /^\s+at /.test(line));
  reported.stack = [`${reported.name}: ${reported.message}`, ...frames].join(
    '\n'
  );
  return reported;
}

/**
 * What to report for `error`, caught around `operation` (an op name or a
 * fixed label, never a value). A database error, or one caused by it,
 * becomes a `DatabaseError` naming only the operation: the original's stack
 * frames, but no message, query, parameters, or cause. Anything else is
 * reported as is.
 */
export function reportableError(error: unknown, operation: string): unknown {
  if (!isDatabaseError(error)) return error;
  return withFramesOf(
    new DatabaseError(`database query failed: ${operation}`),
    error
  );
}

/** `Sentry.captureException` for a failure caught around `operation`. */
export function captureFailure(error: unknown, operation: string): void {
  Sentry.captureException(reportableError(error, operation));
}

/**
 * `captureFailure` for code whose every error may quote user-linked values,
 * not only database ones: Shared Spaces, whose Durable Object's SQLite
 * errors can name its tables' contents. Any error is reported as an
 * `OperationError` whose message is `operation` alone, with the original's
 * stack frames but no message or cause.
 */
export function captureOperationFailure(
  error: unknown,
  operation: string
): void {
  Sentry.captureException(withFramesOf(new OperationError(operation), error));
}

/**
 * Rewrites strings in place through plain objects and arrays. Anything else
 * (SDK class instances such as scopes) is left alone.
 */
function scrubStrings(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return redactDatabaseErrors(
      redactSecretQueryParameters(redactContactLinkPayloads(value))
    );
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const scrubbed = scrubStrings(record[key], seen);
    if (scrubbed !== record[key]) record[key] = scrubbed;
  }
  return value;
}

/**
 * Headers an event may carry; every other one is dropped. The SDK copies
 * every request header into events (with `sendDefaultPii: false` it leaves
 * out only cookies), and Cloudflare and our clients send many that name the
 * caller or the user's data: the IP (`cf-connecting-ip`, `x-forwarded-for`,
 * `forwarded`), where they are (`cf-ipcountry`), their device and language
 * (`user-agent`, `accept-language`), a per-request id Cloudflare can tie to
 * the IP (`cf-ray`), credentials (`authorization`, `x-ww-admin-token`, live
 * tickets in `sec-websocket-protocol`), and ids and metadata of the user's
 * data (`x-buddies-*`, `x-ww-slot-id`, `x-ww-photo-name`, `x-ww-photo-meta`,
 * `x-ww-sha256`, `x-ww-sync-admission`, `x-ww-live-ticket`, Shared Spaces'
 * tokens). A list of what to drop always misses the next header someone
 * adds, so this lists what to keep. Names are lowercase.
 */
const ALLOWED_HEADERS = new Set(['content-type', 'content-length']);

const isAllowedHeader = (name: string): boolean =>
  ALLOWED_HEADERS.has(name.toLowerCase());

/** Deletes every header in `headers` that isn't allowed. */
function keepAllowedHeaders(headers: Record<string, unknown> | undefined): void {
  if (!headers || typeof headers !== 'object') return;
  for (const name of Object.keys(headers)) {
    if (!isAllowedHeader(name)) delete headers[name];
  }
}

/**
 * Span and breadcrumb data name headers as OpenTelemetry attributes
 * (`http.request.header.<name>`, `http.response.header.<name>`). This SDK
 * doesn't set them today; this keeps a later one from sending them.
 */
const HEADER_ATTRIBUTE = /^http\.(?:request|response)\.header\.(.+)$/i;

function keepAllowedHeaderAttributes(
  data: Record<string, unknown> | undefined
): void {
  if (!data || typeof data !== 'object') return;
  for (const key of Object.keys(data)) {
    const header = HEADER_ATTRIBUTE.exec(key)?.[1];
    if (header != null && !isAllowedHeader(header)) delete data[key];
  }
}

/**
 * Applies the header allowlist wherever an event carries headers: the
 * request, the response context, the trace's and every span's data, and
 * breadcrumbs. Also drops the `culture` context, which the SDK fills with
 * the timezone Cloudflare places the caller in.
 */
function dropDisallowedHeaders(event: Event): void {
  keepAllowedHeaders(event.request?.headers);
  const contexts = event.contexts;
  if (contexts) {
    keepAllowedHeaders(
      (contexts.response as { headers?: Record<string, unknown> } | undefined)
        ?.headers
    );
    keepAllowedHeaderAttributes(contexts.trace?.data);
    delete contexts.culture;
  }
  for (const span of event.spans ?? []) keepAllowedHeaderAttributes(span.data);
  for (const breadcrumb of event.breadcrumbs ?? [])
    keepAllowedHeaderAttributes(breadcrumb.data);
}

/**
 * `event.request.query_string` is a string from this SDK, which
 * `scrubStrings` covers, but the event format also allows an object or a
 * list of pairs, whose values only their keys name.
 */
function redactQueryStringPairs(event: Event): void {
  const request = event.request;
  const query = request?.query_string;
  if (!request || query == null || typeof query === 'string') return;
  if (Array.isArray(query)) {
    request.query_string = query.map(([name, value]) => [
      name,
      isSecretQueryParameter(name) ? REDACTED_QUERY_VALUE : value,
    ]);
    return;
  }
  for (const name of Object.keys(query)) {
    if (isSecretQueryParameter(name)) query[name] = REDACTED_QUERY_VALUE;
  }
}

/**
 * Drops every exception chained under a redacted database error (its
 * `cause`, which for Drizzle is D1's own error, and so on down). The
 * linked-errors integration lists each cause as another exception whose
 * `mechanism.parent_id` names the one it caused.
 */
function dropDatabaseErrorCauses(event: Event): void {
  const values = event.exception?.values;
  if (!values) return;
  const redacted = new Set<number>();
  for (const value of values) {
    const id = value.mechanism?.exception_id;
    if (id != null && value.value?.includes(REDACTED_DATABASE_ERROR)) {
      redacted.add(id);
    }
  }
  if (redacted.size === 0) return;
  const below = new Set<number>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const value of values) {
      const { exception_id: id, parent_id: parent } = value.mechanism ?? {};
      if (id == null || parent == null || below.has(id)) continue;
      if (redacted.has(parent) || below.has(parent)) {
        below.add(id);
        grew = true;
      }
    }
  }
  event.exception!.values = values.filter((value) => {
    const id = value.mechanism?.exception_id;
    return id == null || !below.has(id);
  });
}

/**
 * Request bodies never leave the worker: they hold passkey assertions and
 * registrations, challenge tokens, tickets, wraps, and sealed labels. The SDK
 * doesn't attach them today; this keeps it that way.
 */
function dropRequestBody(event: Event): void {
  if (event.request && 'data' in event.request) delete event.request.data;
}

function scrubEvent<T extends Event>(event: T): T {
  dropDisallowedHeaders(event);
  dropRequestBody(event);
  redactQueryStringPairs(event);
  const scrubbed = scrubStrings(event) as T;
  dropDatabaseErrorCauses(scrubbed);
  return scrubbed;
}

function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  keepAllowedHeaderAttributes(breadcrumb.data);
  return scrubStrings(breadcrumb) as Breadcrumb;
}

/**
 * The SDK names each transaction after the raw request path. Rename it to the
 * matched route (e.g. `GET /c/:payload`) for routes whose path carries user
 * data.
 */
export function nameTransactionAfterRoute(context: Context): void {
  const activeSpan = Sentry.getActiveSpan();
  const route = routePath(context);
  if (!activeSpan || !route) return;
  const rootSpan = Sentry.getRootSpan(activeSpan);
  rootSpan.updateName(`${context.req.method} ${route}`);
  rootSpan.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
}

const isContactLinkPath = (path: string | undefined) =>
  path === '/c' || path === '/contacts' || !!path?.startsWith('/c/');

export function createSentryConfig(environment: Environment): CloudflareOptions {
  return {
    dsn: environment.SENTRY_DSN,
    // Must match the release name used when uploading source maps
    // (`pnpm run sentry:sourcemaps` — the git commit sha). Sentry resolves
    // minified stack frames against the artifacts uploaded for this release.
    release: environment.SENTRY_RELEASE,
    // Use our route policy even when a caller propagates a sampling decision.
    // Error capture is independent of trace sampling and remains at 100%.
    tracesSampler: ({ name }) => {
      if (environment.APP_ATTEST_ENVIRONMENT === 'development') return 1;
      // @sentry/cloudflare 8 names its root span "METHOD /path".
      const path = name.split(' ')[1];
      const isImportOperation =
        path === '/notes-import' ||
        (path?.startsWith('/notes-import/') && path !== '/notes-import/status');
      // Attestation was part of Notes Import's operation traffic; it stays at
      // 100% under its own paths.
      const isAttestationOperation =
        path?.startsWith('/attestation/') && path !== '/attestation/v1/status';
      if (isImportOperation || isAttestationOperation) return 1;
      // Contact link pages are never traced: `/c/<payload>` carries a whole
      // contact in its path, and a trace is a record of the request.
      return isContactLinkPath(path) ? 0 : 0.1;
    },
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

export { Sentry };
