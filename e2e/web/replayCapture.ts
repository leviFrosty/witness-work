import zlib from 'node:zlib'
import type { Page, Request } from '@playwright/test'
import { profile } from './fixtures'
import { cors } from './session'

/**
 * What the web's session replay sends, for `replay.spec.ts` (ADR 0043): the
 * PostHog ingestion host's answers, and every request and recording the page
 * made to it, decoded back into the rrweb events the recorder produced.
 */

export const ingestOrigin = new URL(profile.posthogOrigin).origin

export type Sent = {
  url: URL
  method: string
  resourceType: string
  body: Buffer | null
}

/** A decoded recording event (rrweb's), whatever its nesting. */
export type ReplayEvent = Record<string, unknown>

const gunzip = (bytes: Buffer): Buffer =>
  bytes[0] === 0x1f && bytes[1] === 0x8b ? zlib.gunzipSync(bytes) : bytes

/** The JSON a request's body holds, however the SDK packed it; null if none. */
const parseBody = (body: Buffer | null, url: URL): unknown => {
  if (!body?.length) return null
  try {
    let text = gunzip(body).toString('utf8')
    // Some transports send `data=<base64 json>`.
    if (text.startsWith('data=')) {
      text = Buffer.from(decodeURIComponent(text.slice(5)), 'base64').toString(
        'utf8'
      )
    }
    return JSON.parse(text)
  } catch {
    return url.searchParams.get('compression') ? 'undecodable' : null
  }
}

/**
 * Snapshot data is packed again, per event: gzipped JSON held in a string, one
 * character to the byte. Unpack every level so the checks see the whole
 * recording.
 */
const unpack = (value: unknown): unknown => {
  if (typeof value === 'string' && value.startsWith('\u001f\u008b')) {
    try {
      return unpack(
        JSON.parse(zlib.gunzipSync(Buffer.from(value, 'latin1')).toString())
      )
    } catch {
      return value
    }
  }
  if (Array.isArray(value)) return value.map(unpack)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, unpack(child)])
    )
  }
  return value
}

export class Ingest {
  readonly requests: Sent[] = []
  /** Every request the page made, to any host. */
  readonly everyUrl: { url: URL; resourceType: string }[] = []

  /** Recordings sent so far, decoded. */
  snapshots(): ReplayEvent[] {
    const events: ReplayEvent[] = []
    for (const sent of this.requests) {
      if (sent.method !== 'POST') continue
      const parsed = unpack(parseBody(sent.body, sent.url))
      const batch = Array.isArray(parsed)
        ? parsed
        : ((parsed as { batch?: unknown[] } | null)?.batch ?? [parsed])
      for (const item of batch) {
        const entry = item as { event?: string; properties?: ReplayEvent }
        if (entry?.event !== '$snapshot') continue
        const data = entry.properties?.$snapshot_data
        if (Array.isArray(data)) events.push(...(data as ReplayEvent[]))
      }
    }
    return events
  }

  /** Every `$snapshot` event's own properties, apart from its recording. */
  snapshotProperties(): ReplayEvent[] {
    const found: ReplayEvent[] = []
    for (const sent of this.requests) {
      if (sent.method !== 'POST') continue
      const parsed = unpack(parseBody(sent.body, sent.url))
      const batch = Array.isArray(parsed)
        ? parsed
        : ((parsed as { batch?: unknown[] } | null)?.batch ?? [parsed])
      for (const item of batch) {
        const entry = item as { event?: string; properties?: ReplayEvent }
        if (entry?.event === '$snapshot' && entry.properties) {
          const { $snapshot_data, ...rest } = entry.properties
          void $snapshot_data
          found.push(rest)
        }
      }
    }
    return found
  }

  /** Names of every event the ingestion host was sent. */
  eventNames(): string[] {
    const names: string[] = []
    for (const sent of this.requests) {
      if (sent.method !== 'POST') continue
      const parsed = unpack(parseBody(sent.body, sent.url))
      const batch = Array.isArray(parsed)
        ? parsed
        : ((parsed as { batch?: unknown[] } | null)?.batch ?? [parsed])
      for (const item of batch) {
        const name = (item as { event?: unknown })?.event
        if (typeof name === 'string') names.push(name)
      }
    }
    return names
  }

  /** Recording uploads, which are the requests to the recording endpoint. */
  uploads(): Sent[] {
    return this.requests.filter(
      (sent) => sent.method === 'POST' && sent.url.pathname.startsWith('/s/')
    )
  }
}

/** Walks every object and array in `value`. */
export function walk(value: unknown, visit: (node: unknown) => void): void {
  visit(value)
  if (Array.isArray(value)) value.forEach((child) => walk(child, visit))
  else if (value && typeof value === 'object')
    Object.values(value).forEach((child) => walk(child, visit))
}

/** What a recording shows: its text, element names, and attribute values. */
export function describeRecording(events: ReplayEvent[]) {
  const texts: string[] = []
  const tags: string[] = []
  const attributes: { name: string; value: unknown }[] = []
  const inputs: string[] = []
  const elements: Record<string, unknown>[] = []
  // The app's own stylesheet, which is code and not content.
  const stylesheets = new Set<unknown>()
  const stylesheetIds = new Set<unknown>()
  const styleElementIds = new Set<unknown>()
  walk(events, (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return
    const record = node as Record<string, unknown>
    if (record.tagName === 'style') styleElementIds.add(record.id)
    // A mutation that adds to a stylesheet's element.
    if (styleElementIds.has(record.parentId)) {
      stylesheets.add(record.node)
      stylesheetIds.add((record.node as { id?: unknown } | undefined)?.id)
    }
    if (record.tagName === 'style' && Array.isArray(record.childNodes))
      record.childNodes.forEach((child) => {
        stylesheets.add(child)
        stylesheetIds.add((child as { id?: unknown }).id)
      })
    // A comment (type 5) is the page's own markup; React renders none.
    if (
      typeof record.textContent === 'string' &&
      record.type !== 5 &&
      record.isStyle !== true &&
      !stylesheets.has(record)
    )
      texts.push(record.textContent)
    // A text mutation: `{ id, value }`.
    if (
      typeof record.value === 'string' &&
      'id' in record &&
      !stylesheetIds.has(record.id)
    )
      texts.push(record.value)
    if (typeof record.tagName === 'string') {
      tags.push(record.tagName)
      elements.push(record)
    }
    if (record.attributes && typeof record.attributes === 'object') {
      for (const [name, value] of Object.entries(record.attributes))
        attributes.push({ name, value })
    }
    // An input event: `{ source: 5, text, isChecked }`.
    if (record.source === 5 && typeof record.text === 'string')
      inputs.push(record.text)
  })
  return { texts, tags, attributes, inputs, elements }
}

const remoteConfig = (token: string) => ({
  token,
  supportedCompression: ['gzip', 'gzip-js'],
  hasFeatureFlags: false,
  captureDeadClicks: false,
  capturePerformance: false,
  autocapture_opt_out: true,
  autocaptureExceptions: false,
  analytics: { endpoint: '/i/v0/e/' },
  elementsChainAsString: true,
  // The project's replay setting, on. The app's own settings still decide.
  sessionRecording: {
    endpoint: '/s/',
    consoleLogRecordingEnabled: false,
    recorderVersion: 'v2',
    sampleRate: null,
    minimumDurationMilliseconds: null,
    linkedFlag: null,
    networkPayloadCapture: null,
    masking: null,
    urlTriggers: [],
    urlBlocklist: [],
    eventTriggers: [],
    triggerMatchType: null,
    scriptConfig: { script: 'posthog-recorder' },
  },
  heatmaps: false,
  surveys: false,
  defaultIdentifiedOnly: true,
  siteApps: [],
})

/**
 * Answers the ingestion host as PostHog would with replay turned on for the
 * project, and keeps what the page sends it. Everything else stays blocked, as
 * in every run (`fixtures.ts`).
 */
export async function captureIngest(page: Page): Promise<Ingest> {
  const ingest = new Ingest()
  page.on('request', (request: Request) =>
    ingest.everyUrl.push({
      url: new URL(request.url()),
      resourceType: request.resourceType(),
    })
  )
  await page.route(`${ingestOrigin}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors })
    if (request.method() === 'GET') {
      ingest.requests.push({
        url,
        method: 'GET',
        resourceType: request.resourceType(),
        body: null,
      })
      if (
        url.pathname.startsWith('/array/') &&
        url.pathname.endsWith('/config')
      )
        return route.fulfill({
          headers: cors,
          json: remoteConfig(url.pathname.split('/')[2] ?? ''),
        })
      return route.fulfill({ status: 404, headers: cors })
    }
    ingest.requests.push({
      url,
      method: request.method(),
      resourceType: request.resourceType(),
      body: request.postDataBuffer(),
    })
    return route.fulfill({ headers: cors, json: { status: 1 } })
  })
  return ingest
}
