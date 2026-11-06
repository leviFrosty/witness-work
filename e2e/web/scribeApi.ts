import type { BrowserContext, Request, Route } from '@playwright/test'
import { profile } from './fixtures'
import { cors, corsFor } from './session'

/**
 * Scribe AI's routes (docs/scribe-ai-protocol.md), answered here as ww-api
 * would, so a run reaches no real service. Made-up data only.
 */

/** A step's answer: events as an SSE stream, or a refusal's envelope. */
export type StepAnswer =
  | { events: object[] }
  | { status: number; code: string; body?: object; retryAfter?: number }

export const USAGE = {
  plan: 'free',
  supporterCheckFailed: false,
  windows: [
    {
      id: 'monthly',
      percentUsed: 12,
      resetsAt: Date.now() + 20 * 24 * 60 * 60_000,
      units: { used: 12, limit: 100 },
    },
  ],
  limited: false,
  resetsAt: null,
  asOf: Date.now(),
}

export const LIMITED_USAGE = {
  ...USAGE,
  windows: [
    {
      id: 'monthly',
      percentUsed: 100,
      resetsAt: Date.now() + 3 * 60 * 60_000,
      units: { used: 100, limit: 100 },
    },
  ],
  limited: true,
  resetsAt: Date.now() + 3 * 60 * 60_000,
}

export const DONE = {
  type: 'done',
  usage: {
    inputTokens: 1200,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 40,
    reasoningTokens: 0,
    units: 3,
  },
  meter: USAGE,
}

/** A text answer, streamed in two pieces. */
export const textAnswer = (...deltas: string[]): StepAnswer => ({
  events: [
    { type: 'start', offered: [], dropped: [] },
    ...deltas.map((delta) => ({ type: 'text', delta })),
    { ...DONE, finish: 'end' },
  ],
})

/** A proposal to add a contact, with a line of text first. */
export const addContactAnswer = (name: string): StepAnswer => ({
  events: [
    { type: 'start', offered: ['contacts_create'], dropped: [] },
    { type: 'text', delta: `I can add ${name}. ` },
    { type: 'text', delta: 'Check it, then tap Add.' },
    {
      type: 'tool_call',
      callId: 'call_1',
      name: 'contacts_create',
      args: { name, address: null, phone: null, email: null },
    },
    { ...DONE, finish: 'tool_calls' },
  ],
})

const sse = (events: object[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')

export interface ScribeApiOptions {
  /** The answer for each step request, in order; the last repeats. */
  steps?: StepAnswer[]
  usage?: object
  /** Called with each step's request body. */
  onStep?: (body: Record<string, unknown>, request: Request) => void
}

/**
 * Answers `status`, `usage` and `step` at the web profile's API. Returns the
 * step bodies received, for specs that check what was sent. Anything else under
 * the API stays with the fixture (a service that's down).
 */
export async function mockScribeApi(
  context: BrowserContext,
  {
    steps = [textAnswer('Hello.')],
    usage = USAGE,
    onStep,
  }: ScribeApiOptions = {}
) {
  const received: Record<string, unknown>[] = []
  const origin = profile.apiOrigin
  const json = async (route: Route, status: number, body: object) =>
    route.fulfill({
      status,
      headers: await corsFor(route.request()),
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  await context.route(`${origin}/scribe/v1/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: { ...cors, ...(await corsFor(request)) },
      })
    const path = new URL(request.url()).pathname
    if (path.endsWith('/status'))
      return json(route, 200, {
        ok: true,
        enabled: true,
        reason: null,
        protocol: { min: 1, max: 1 },
        minAppVersion: null,
        disabledTools: [],
      })
    if (path.endsWith('/usage')) return json(route, 200, { ok: true, ...usage })
    if (path.endsWith('/step')) {
      const body = request.postDataJSON() as Record<string, unknown>
      received.push(body)
      onStep?.(body, request)
      const answer = steps[Math.min(received.length - 1, steps.length - 1)]
      if ('events' in answer)
        return route.fulfill({
          status: 200,
          headers: {
            ...(await corsFor(request)),
            'cache-control': 'no-cache, no-transform',
          },
          contentType: 'text/event-stream; charset=utf-8',
          body: sse(answer.events),
        })
      return route.fulfill({
        status: answer.status,
        headers: {
          ...(await corsFor(request)),
          ...(answer.retryAfter
            ? { 'retry-after': String(answer.retryAfter) }
            : {}),
        },
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: answer.code,
          code: answer.code,
          retryAfter: answer.retryAfter,
          ...answer.body,
        }),
      })
    }
    return route.fallback()
  })
  return received
}
