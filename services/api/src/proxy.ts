import type { AppContext } from './types';
import { HERE_API, HTTP_STATUS } from './config';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { Sentry } from './sentry';
import { apiError, apiErrorBody, retryAfterHeaders } from './errors';

/** HERE didn't say how long to wait: a minute for 429, half that for 503. */
const DEFAULT_RETRY_AFTER_SECONDS: Partial<Record<number, number>> = {
  429: 60,
  503: 30,
};

/** Our code for a HERE error status; the status itself passes through. */
const hereErrorCode = (status: number): string => {
  if (status === 400) return 'bad_request';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'upstream_error';
};

/** HERE's own `Retry-After` in whole seconds, when it sent one. */
const upstreamRetryAfter = (response: Response): number | undefined => {
  const header = response.headers.get('Retry-After');
  if (header == null) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(header);
  return Number.isNaN(date)
    ? undefined
    : Math.max(1, Math.ceil((date - Date.now()) / 1000));
};

/**
 * HERE's error body with the shared envelope on top, so nothing an older build
 * might read goes missing. 429 and 503 carry `Retry-After`.
 */
const hereErrorResponse = (
  context: AppContext,
  upstream: Response,
  body: unknown
): Response => {
  const status = upstream.status;
  const retryAfter =
    status === 429 || status === 503
      ? (upstreamRetryAfter(upstream) ?? DEFAULT_RETRY_AFTER_SECONDS[status])
      : undefined;
  const extras =
    body != null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  return context.json(
    apiErrorBody(hereErrorCode(status), { retryAfter, extras }),
    status as ContentfulStatusCode,
    retryAfterHeaders(retryAfter)
  );
};

function extractQueryParameters(requestUrl: string): URLSearchParams {
  const url = new URL(requestUrl);
  return new URLSearchParams(url.search);
}

function sanitizeAndInjectApiKey(params: URLSearchParams, apiKey: string): URLSearchParams {
  params.delete(HERE_API.API_KEY_PARAM);
  params.set(HERE_API.API_KEY_PARAM, apiKey);
  return params;
}

function buildHereApiUrl(baseUrl: string, params: URLSearchParams): string {
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Captured at module evaluation, before Sentry's fetch integration wraps
 * `globalThis.fetch`. The wrapped fetch records each request URL as a span and
 * breadcrumb, and HERE's URL carries both the API key and what the user typed.
 */
const uninstrumentedFetch: typeof fetch = globalThis.fetch.bind(globalThis);

async function fetchFromHereApi(url: string): Promise<Response> {
  return uninstrumentedFetch(url);
}

/** Returns the parsed body, or `undefined` when it is not valid JSON. */
async function parseJsonBody(response: Response): Promise<unknown> {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

export async function proxyRequestToHereApi(context: AppContext, hereApiBaseUrl: string) {
  try {
    const queryParams = extractQueryParameters(context.req.url);
    const sanitizedParams = sanitizeAndInjectApiKey(queryParams, context.env.HERE_API_KEY);
    const hereApiUrl = buildHereApiUrl(hereApiBaseUrl, sanitizedParams);

    const hereApiResponse = await fetchFromHereApi(hereApiUrl);
    const responseData = await parseJsonBody(hereApiResponse);

    if (responseData === undefined) {
      // HERE sits behind Cloudflare, so its outages surface as plain-text
      // `error code: 52x` pages rather than JSON. Report the upstream status as
      // one grouped warning instead of a SyntaxError per request.
      Sentry.captureMessage('HERE API returned a non-JSON response', {
        level: 'warning',
        fingerprint: ['here-api-non-json-response'],
        tags: { 'here_api.status': hereApiResponse.status },
      });

      return apiError(HTTP_STATUS.BAD_GATEWAY, 'upstream_error');
    }

    if (!hereApiResponse.ok) {
      return hereErrorResponse(context, hereApiResponse, responseData);
    }
    return context.json(responseData, hereApiResponse.status as ContentfulStatusCode);
  } catch (error) {
    // HERE couldn't be reached at all: the same 502 as an outage page.
    Sentry.captureException(error);
    return apiError(HTTP_STATUS.BAD_GATEWAY, 'upstream_error');
  }
}
