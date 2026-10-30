// Receives CSP and Trusted Types violation reports and logs one compact line
// per violation to Workers observability. Reports come from anyone, so the
// body is capped and only known fields survive, stripped of query strings,
// fragments and script or text samples.

export const MAX_REPORT_BYTES = 16 * 1024
const MAX_REPORTS_PER_REQUEST = 10
const REPORT_TYPES = [
  'application/csp-report',
  'application/reports+json',
  'application/json',
]
// CSP's names for blocked things that aren't URLs.
const KEYWORD = /^[a-z][a-z-]{0,39}$/

export interface Violation {
  directive: string
  disposition: string
  blocked: string
  document: string
  source?: string
  line?: number
  column?: number
  /** The Trusted Types sink, such as `Element innerHTML`. */
  sink?: string
}

type Fields = Record<string, unknown>

const text = (value: unknown) => (typeof value === 'string' ? value : '')

const count = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined

/** An origin and path, or a CSP keyword such as `inline` or `eval`. */
function location(value: unknown): string {
  const raw = text(value)
  if (KEYWORD.test(raw)) return raw
  try {
    const url = new URL(raw)
    // Other schemes (`mailto:`, `javascript:`, extensions) have no origin,
    // and the rest of the URL can be anything, so only the scheme is kept.
    if (url.protocol !== 'https:' && url.protocol !== 'http:')
      return url.protocol.slice(0, -1).slice(0, 40)
    return `${url.origin}${url.pathname}`.slice(0, 200)
  } catch {
    return raw ? 'other' : ''
  }
}

function violation(fields: Fields, legacy: boolean): Violation | undefined {
  const field = (modern: string, old: string) =>
    legacy ? fields[old] : fields[modern]
  const directive = text(
    legacy
      ? fields['effective-directive'] || fields['violated-directive']
      : fields.effectiveDirective
  ).split(' ')[0]
  if (!KEYWORD.test(directive)) return undefined
  const sample = text(field('sample', 'script-sample'))
  const sinkName = sample.split('|')[0]
  const isTrustedTypes = directive.includes('trusted-types')
  return {
    directive,
    disposition: text(field('disposition', 'disposition')) || 'unknown',
    blocked: location(field('blockedURL', 'blocked-uri')),
    document: location(field('documentURL', 'document-uri')),
    source: location(field('sourceFile', 'source-file')) || undefined,
    line: count(field('lineNumber', 'line-number')),
    column: count(field('columnNumber', 'column-number')),
    sink:
      isTrustedTypes && /^[A-Za-z][A-Za-z. ]{0,59}$/.test(sinkName)
        ? sinkName
        : undefined,
  }
}

/**
 * Every shape browsers send: Reporting API batches (Chromium), a single
 * Reporting API report (WebKit, even to `report-uri`), and the legacy
 * `report-uri` body (Firefox).
 */
export function parseViolations(body: unknown): Violation[] {
  const entries: [Fields, boolean][] = []
  if (
    Array.isArray(body) ||
    (body as Fields | null)?.type === 'csp-violation'
  ) {
    for (const report of Array.isArray(body) ? body : [body])
      if (
        report?.type === 'csp-violation' &&
        report.body &&
        typeof report.body === 'object'
      )
        entries.push([report.body, false])
  } else if (body && typeof body === 'object' && 'csp-report' in body) {
    const report = (body as Fields)['csp-report']
    if (report && typeof report === 'object')
      entries.push([report as Fields, true])
  }
  return entries
    .slice(0, MAX_REPORTS_PER_REQUEST)
    .map(([fields, legacy]) => violation(fields, legacy))
    .filter((report): report is Violation => !!report)
}

async function readCapped(request: Request): Promise<string | undefined> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_REPORT_BYTES) {
      await reader.cancel()
      return undefined
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

const status = (code: number, headers?: HeadersInit) =>
  new Response(null, { status: code, headers })

export async function receiveReport(
  request: Request,
  log: (line: string) => void = console.log
): Promise<Response> {
  if (request.method !== 'POST') return status(405, { Allow: 'POST' })
  const type = (request.headers.get('Content-Type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (!REPORT_TYPES.includes(type)) return status(415)
  const declared = Number(request.headers.get('Content-Length'))
  if (declared > MAX_REPORT_BYTES) return status(413)
  const raw = await readCapped(request)
  if (raw === undefined) return status(413)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return status(400)
  }
  // Only this origin's pages: reports about other sites are noise.
  const origin = new URL(request.url).origin
  for (const report of parseViolations(body))
    if (report.document.startsWith(`${origin}/`))
      log(JSON.stringify({ event: 'csp-violation', ...report }))
  return status(204)
}
