import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { BrowserContext, Frame, Page } from '@playwright/test'
import { profile } from './fixtures'
import { cors } from './session'

export type FrameKind = 'double' | 'real'

const root = path.join(__dirname, '../..')
const built = new Map<FrameKind, Promise<string>>()

const DOUBLE_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Map double</title>
<style>
html, body, #map { margin: 0; width: 100%; height: 100%; overflow: hidden; }
#map { position: relative; background-color: #e8eef2; background-image:
  linear-gradient(#c9d3db 1px, transparent 1px),
  linear-gradient(90deg, #c9d3db 1px, transparent 1px);
  background-size: 64px 64px; touch-action: none; cursor: grab; }
#map[data-scheme="dark"] { background-color: #1f262c; }
.lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.pins { position: absolute; inset: 0; pointer-events: none; }
.pin { position: absolute; width: 18px; height: 18px; margin: -18px 0 0 -9px;
  border: 2px solid #fff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
  pointer-events: auto; padding: 0; cursor: pointer; }
.user { position: absolute; width: 14px; height: 14px; margin: -7px; border-radius: 50%;
  background: #0a84ff; border: 3px solid #fff; }
</style>
<script type="module" src="/frame.js"></script></head>
<body><div id="map"></div></body></html>`

async function build(kind: FrameKind): Promise<string> {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `ww-maps-${kind}-`))
  if (kind === 'real') {
    const { buildFrame } = await import('../../scripts/web-maps.mjs')
    await buildFrame('beta', out)
    return out
  }
  const { build: bundle } = await import('esbuild')
  await bundle({
    entryPoints: [path.join(__dirname, 'mapsFrameDouble.ts')],
    outfile: path.join(out, 'frame.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    absWorkingDir: root,
    logLevel: 'warning',
  })
  fs.writeFileSync(path.join(out, 'index.html'), DOUBLE_PAGE)
  return out
}

const frameHeaders = (dir: string): Record<string, string> => {
  const file = path.join(dir, '_headers')
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('  '))
      .map((line) => {
        const at = line.indexOf(':')
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
      })
  )
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

export async function serveMapsFrame(context: BrowserContext, kind: FrameKind) {
  if (!built.has(kind)) built.set(kind, build(kind))
  const dir = await built.get(kind)!
  const headers = frameHeaders(dir)
  await context.route(`${profile.mapsOrigin}/**`, (route) => {
    const { pathname } = new URL(route.request().url())
    const file = path.join(dir, pathname === '/' ? 'index.html' : pathname)
    if (!file.startsWith(dir) || !fs.existsSync(file))
      return route.fulfill({ status: 404, headers })
    return route.fulfill({
      status: 200,
      headers: { ...headers, 'Content-Type': TYPES[path.extname(file)] ?? '' },
      body: fs.readFileSync(file),
    })
  })
}

export async function answerMapKitTokens(
  context: BrowserContext,
  status: 200 | 503
) {
  const requests: unknown[] = []
  await context.route(`${profile.apiOrigin}/maps/v1/mapkit-tokens`, (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors })
    requests.push({
      body: route.request().postDataJSON(),
      authorization: route.request().headers().authorization,
    })
    return route.fulfill({
      status,
      headers: { ...cors, ...(status === 503 && { 'Retry-After': '60' }) },
      contentType: 'application/json',
      body: JSON.stringify(
        status === 200
          ? {
              ok: true,

              token: 'eyJhbGciOiJFUzI1NiJ9.eyJzY29wZSI6InRlc3QifQ.dGVzdA',
              origin: profile.mapsOrigin,
              expiresAt: Date.now() + 30 * 60_000,
            }
          : { ok: false, error: 'maps_unconfigured' }
      ),
    })
  })
  return requests
}

export async function mapsFrame(page: Page): Promise<Frame> {
  for (;;) {
    const frame = page
      .frames()
      .find((candidate) => candidate.url().startsWith(profile.mapsOrigin))
    if (frame) return frame
    await page.waitForTimeout(100)
  }
}

export const receivedByFrame = async (page: Page) =>
  (await mapsFrame(page)).evaluate(
    () =>
      (window as unknown as { __wwMapsReceived: unknown[] }).__wwMapsReceived
  )

export async function answerDirections(context: BrowserContext) {
  const requests: { lat: number; lng: number }[][] = []
  await context.route(
    `${profile.apiOrigin}/route-planning/directions`,
    (route) => {
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers: cors })
      const { points } = route.request().postDataJSON() as {
        points: { lat: number; lng: number }[]
      }
      requests.push(points)
      const legs = points.slice(1).map((to, index) => {
        const from = points[index]!
        return {
          distanceMeters: 1200,
          durationSeconds: 240,
          coordinates: [from.lat, from.lng, from.lat, to.lng, to.lat, to.lng],
        }
      })
      return route.fulfill({
        status: 200,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, legs }),
      })
    }
  )
  return requests
}

export async function answerPlaceSearch(context: BrowserContext) {
  const queries: Record<string, string>[] = []
  await context.route(`${profile.apiOrigin}/places/v1/search**`, (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors })
    const params = Object.fromEntries(
      new URL(route.request().url()).searchParams
    )
    queries.push(params)
    const [lat, lng] = params.at!.split(',').map(Number)
    return route.fulfill({
      status: 200,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        items: [
          {
            id: 'here:pds:place:smoke-1',
            name: 'Lantern Street Library',
            category: { id: '800-8300-0000', name: 'Library' },
            address: {
              label: '40 Lantern St, Maplecrest, OH 45202, United States',
              houseNumber: '40',
              street: 'Lantern St',
              city: 'Maplecrest',
              postalCode: '45202',
              countryName: 'United States',
            },
            latitude: lat! + 0.004,
            longitude: lng! - 0.006,
            distanceMeters: 640,
          },
        ],
      }),
    })
  })
  return queries
}

export const mapsFrames = (page: Page) =>
  page.frames().filter((frame) => frame.url().startsWith(profile.mapsOrigin))
