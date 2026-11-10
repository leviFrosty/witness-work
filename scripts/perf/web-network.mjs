#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const SECRET_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-ww-dev-bypass',
  'sec-websocket-protocol',
  'sec-websocket-key',
  'sec-websocket-accept',
])
const SECRET_FIELDS =
  /"(accessToken|refreshToken|ticket|token|secret|challengeToken|recoveryKey|nonce|sig|signature|attestation|api_key|apiKey|distinct_id|\$device_id|\$session_id|\$anon_distinct_id|app_user_id|original_app_user_id)"\s*:\s*"[^"]*"/g
const KEPT_HEADERS = [
  'content-type',
  'content-encoding',
  'content-length',
  'cache-control',
  'etag',
  'last-modified',
  'expires',
  'age',
  'vary',
  'cf-cache-status',
  'access-control-max-age',
  'if-none-match',
  'if-match',
  'if-modified-since',
  'sec-websocket-extensions',
  'origin',
  'access-control-request-headers',
  'access-control-request-method',
  'accept-encoding',
]

export const scrub = (text) =>
  text.replace(SECRET_FIELDS, (_, name) => `"${name}":"<redacted>"`)

const pickHeaders = (headers = {}) => {
  const out = {}
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase()
    if (SECRET_HEADERS.has(key)) out[key] = '<redacted>'
    else if (KEPT_HEADERS.includes(key)) out[key] = String(value)
  }
  return out
}

const headerBytes = (headers = {}) =>
  Object.entries(headers).reduce(
    (sum, [name, value]) => sum + name.length + String(value).length + 4,
    0
  )

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.next = 1
    this.pending = new Map()
    this.listeners = []
    this.ready = new Promise((resolve, reject) => {
      this.socket.onopen = () => resolve()
      this.socket.onerror = (event) =>
        reject(new Error(`CDP socket: ${event.message ?? 'failed'}`))
    })
    this.closed = false
    this.socket.onclose = (event) => {
      this.closed = true
      this.closeReason = `${event.code} ${event.reason}`.trim()
      for (const waiter of this.pending.values())
        waiter.reject(new Error(`${waiter.method}: the browser went away`))
      this.pending.clear()
    }
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      this.last = `${message.method ?? `answer to ${this.pending.get(message.id)?.method}`} (${event.data.length} chars)`
      if (message.id) {
        const waiter = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (!waiter) return
        if (message.error)
          waiter.reject(new Error(`${waiter.method}: ${message.error.message}`))
        else waiter.resolve(message.result)
        return
      }
      for (const listener of this.listeners)
        listener(message.method, message.params, message.sessionId)
    }
  }

  send(method, params = {}, sessionId) {
    if (this.closed)
      return Promise.reject(new Error(`${method}: the browser went away`))
    const id = this.next++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method}: no answer`))
      }, 90_000)
      this.pending.set(id, {
        method,
        resolve: (value) => (clearTimeout(timer), resolve(value)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      })
      if (process.env.WW_CDP_DEBUG) console.error('>', method, sessionId ?? '')
      this.socket.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }

  on(listener) {
    this.listeners.push(listener)
  }

  close() {
    this.socket.close()
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function launch({ profile, headed }) {
  const { chromium } = require('@playwright/test')
  const child = spawn(
    chromium.executablePath(),
    [
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      ...(headed ? [] : ['--headless=new']),
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--disable-features=Translate,MediaRouter,OptimizationHints',
      '--password-store=basic',
      '--use-mock-keychain',
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: 'ignore' }
  )
  const stop = () => {
    try {
      child.kill('SIGKILL')
    } catch {}
  }
  process.once('exit', stop)
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.once(signal, () => {
      stop()
      process.exit(1)
    })

  const portFile = path.join(profile, 'DevToolsActivePort')
  fs.rmSync(portFile, { force: true })
  let exited = null
  child.on('exit', (code) => (exited = code ?? 1))
  let url = null
  for (let waited = 0; waited < 300_000 && !url; waited += 500) {
    if (exited != null) throw new Error(`Chromium exited ${exited}`)
    if (fs.existsSync(portFile)) {
      const [port, browserPath] = fs.readFileSync(portFile, 'utf8').split('\n')
      if (port && browserPath) url = `ws://127.0.0.1:${port}${browserPath}`
    }
    if (!url) await sleep(500)
  }
  if (!url) {
    stop()
    throw new Error("Chromium didn't start")
  }
  const cdp = new Cdp(url)
  await cdp.ready
  return { cdp, child }
}

function recorder(cdp) {
  const targets = new Map()
  let phase = null

  const key = (sessionId, requestId) => `${sessionId}:${requestId}`
  const entry = (sessionId, requestId) =>
    phase?.requests.get(key(sessionId, requestId))

  const attach = async (sessionId, info) => {
    if (
      !['page', 'iframe', 'worker', 'shared_worker', 'service_worker'].includes(
        info.type
      ) ||
      /^(chrome|chrome-extension|devtools):/.test(info.url)
    ) {
      await cdp
        .send('Target.detachFromTarget', { sessionId })
        .catch(() => undefined)
      return
    }
    if (
      [...targets.values()].some((known) => known.targetId === info.targetId)
    ) {
      await cdp
        .send('Target.detachFromTarget', { sessionId })
        .catch(() => undefined)
      return
    }
    targets.set(sessionId, info)
    const send = (method, params) =>
      cdp.send(method, params, sessionId).catch(() => undefined)
    await Promise.all([
      send('Network.enable', { maxPostDataSize: 1 << 20 }),
      send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
      }),
    ])
    await send('Runtime.runIfWaitingForDebugger')
  }

  const stack = (initiator) => {
    const frames = []
    for (
      let trace = initiator?.stack;
      trace && frames.length < 40;
      trace = trace.parent
    ) {
      if (trace.description && frames.length)
        frames.push({ async: trace.description })
      for (const frame of trace.callFrames ?? []) {
        if (frames.length >= 40) break
        frames.push({
          fn: frame.functionName || '(anonymous)',
          url: frame.url,
          line: frame.lineNumber + 1,
          column: frame.columnNumber + 1,
        })
      }
    }
    return frames
  }

  cdp.on((method, params, sessionId) => {
    if (method === 'Target.attachedToTarget') {
      if (process.env.WW_CDP_DEBUG)
        console.error(
          '< attached',
          params.targetInfo.type,
          params.targetInfo.url,
          params.sessionId,
          'parent',
          sessionId ?? 'browser',
          'waiting',
          params.waitingForDebugger
        )
      void attach(params.sessionId, params.targetInfo)
      return
    }
    if (method === 'Target.detachedFromTarget') return
    if (!phase || !method.startsWith('Network.')) return
    const at = () => Math.round((params.timestamp - phase.origin) * 1000)
    const target = targets.get(sessionId)

    switch (method) {
      case 'Network.requestWillBeSent': {
        if (phase.origin == null) phase.origin = params.timestamp
        if (/^(data|blob|about|chrome-extension):/.test(params.request.url))
          return
        phase.lastActivity = Date.now()
        const previous = entry(sessionId, params.requestId)
        if (previous && params.redirectResponse) {
          previous.status = params.redirectResponse.status
          previous.redirectedTo = params.request.url
          previous.finishedAt = at()
          phase.requests.delete(key(sessionId, params.requestId))
          phase.requests.set(
            `${key(sessionId, params.requestId)}:r${phase.requests.size}`,
            previous
          )
        }
        phase.requests.set(key(sessionId, params.requestId), {
          seq: phase.count++,
          startedAt: at(),
          target: target?.type ?? 'unknown',
          method: params.request.method,
          url: params.request.url,
          type:
            params.initiator?.type === 'preflight'
              ? 'Preflight'
              : (params.type ?? 'Other'),
          initiator: params.initiator?.type ?? 'other',
          initiatorUrl: params.initiator?.url,
          stack: stack(params.initiator),
          requestHeaders: pickHeaders(params.request.headers),
          requestHeaderBytes: headerBytes(params.request.headers),
          requestBodyBytes: params.request.postData
            ? Buffer.byteLength(params.request.postData)
            : 0,
          requestBody: params.request.postData,
          hasPostData: params.request.hasPostData ?? false,
          pending: true,
        })
        phase.pending.add(key(sessionId, params.requestId))
        return
      }
      case 'Network.requestWillBeSentExtraInfo': {
        const request = entry(sessionId, params.requestId)
        if (!request) return
        request.requestHeaders = pickHeaders(params.headers)
        request.requestHeaderBytes = headerBytes(params.headers)
        return
      }
      case 'Network.requestServedFromCache': {
        const request = entry(sessionId, params.requestId)
        if (request) request.servedFromCache = true
        return
      }
      case 'Network.responseReceived': {
        const request = entry(sessionId, params.requestId)
        if (!request) return
        const { response } = params
        request.status = response.status
        request.protocol = response.protocol
        request.mimeType = response.mimeType
        request.responseHeaders = pickHeaders(response.headers)
        request.responseHeaderBytes = response.encodedDataLength
        request.ttfbMs = at() - request.startedAt
        request.source = response.fromServiceWorker
          ? 'service-worker'
          : response.fromPrefetchCache
            ? 'prefetch-cache'
            : response.fromDiskCache
              ? 'disk-cache'
              : request.servedFromCache
                ? 'memory-cache'
                : 'network'
        request.reusedConnection = response.connectionReused
        return
      }
      case 'Network.dataReceived': {
        const request = entry(sessionId, params.requestId)
        if (request)
          request.decodedBodyBytes =
            (request.decodedBodyBytes ?? 0) + params.dataLength
        return
      }
      case 'Network.loadingFinished': {
        const request = entry(sessionId, params.requestId)
        if (!request) return
        request.pending = false
        request.finishedAt = at()
        request.wireBytes = params.encodedDataLength
        phase.pending.delete(key(sessionId, params.requestId))
        phase.lastActivity = Date.now()

        if (
          phase.bodies &&
          request.source === 'network' &&
          (request.decodedBodyBytes ?? 0) <= 200_000 &&
          /json|text\/plain/.test(request.mimeType ?? '')
        )
          phase.bodyReads.push(
            cdp
              .send(
                'Network.getResponseBody',
                { requestId: params.requestId },
                sessionId
              )
              .then((body) => {
                if (body.base64Encoded) return
                request.responseBody = body.body
              })
              .catch(() => undefined)
          )
        if (request.hasPostData && request.requestBody == null)
          phase.bodyReads.push(
            cdp
              .send(
                'Network.getRequestPostData',
                { requestId: params.requestId },
                sessionId
              )
              .then((body) => {
                request.requestBody = body.postData
                request.requestBodyBytes = Buffer.byteLength(body.postData)
              })
              .catch(() => undefined)
          )
        return
      }
      case 'Network.loadingFailed': {
        const request = entry(sessionId, params.requestId)
        if (!request) return
        request.pending = false
        request.finishedAt = at()
        request.failed = params.errorText
        request.blocked = params.blockedReason
        phase.pending.delete(key(sessionId, params.requestId))
        phase.lastActivity = Date.now()
        return
      }
      case 'Network.webSocketCreated': {
        phase.lastActivity = Date.now()
        phase.sockets.set(key(sessionId, params.requestId), {
          url: params.url,
          target: target?.type ?? 'unknown',
          createdAt: phase.origin == null ? 0 : null,
          createdWall: Date.now(),
          stack: stack(params.initiator),
          frames: [],
        })
        return
      }
      case 'Network.webSocketWillSendHandshakeRequest': {
        const socket = phase.sockets.get(key(sessionId, params.requestId))
        if (!socket) return
        socket.createdAt = at()
        socket.requestHeaders = pickHeaders(params.request.headers)
        socket.requestHeaderBytes = headerBytes(params.request.headers)
        return
      }
      case 'Network.webSocketHandshakeResponseReceived': {
        const socket = phase.sockets.get(key(sessionId, params.requestId))
        if (!socket) return
        socket.openedAt = at()
        socket.status = params.response.status
        socket.responseHeaders = pickHeaders(params.response.headers)
        socket.responseHeaderBytes = headerBytes(params.response.headers)
        return
      }
      case 'Network.webSocketFrameSent':
      case 'Network.webSocketFrameReceived': {
        const socket = phase.sockets.get(key(sessionId, params.requestId))
        if (!socket) return
        const data = params.response.payloadData ?? ''
        socket.frames.push({
          at: at(),
          direction: method.endsWith('Sent') ? 'sent' : 'received',
          opcode: params.response.opcode,
          bytes: Buffer.byteLength(data),
          data: scrub(data.slice(0, 400)),
        })
        return
      }
      case 'Network.webSocketClosed': {
        const socket = phase.sockets.get(key(sessionId, params.requestId))
        if (socket) socket.closedAt = at()
        return
      }
    }
  })

  return {
    targets,
    begin(name, { bodies }) {
      phase = {
        name,
        origin: null,
        count: 0,
        requests: new Map(),
        sockets: new Map(),
        pending: new Set(),
        lastActivity: Date.now(),
        bodies,
        bodyReads: [],
      }
    },
    async settle({ settleMs, maxMs }) {
      const started = Date.now()
      while (Date.now() - started < maxMs) {
        await sleep(250)
        if (cdp.closed)
          throw new Error(
            `The browser went away mid-capture (${cdp.closeReason}); last: ${cdp.last}`
          )
        if (phase.origin == null) continue
        if (
          phase.pending.size === 0 &&
          Date.now() - phase.lastActivity > settleMs
        )
          break
      }
      await Promise.all(phase.bodyReads)
      const done = phase
      phase = null
      return done
    },
  }
}

function symbolicator(dist) {
  if (!dist) return null
  const pnpm = path.join(ROOT, 'node_modules/.pnpm')
  const folder = fs
    .readdirSync(pnpm)
    .filter((name) => name.startsWith('@jridgewell+trace-mapping@'))
    .sort()
    .pop()
  if (!folder) return null
  const { TraceMap, originalPositionFor } = require(
    path.join(pnpm, folder, 'node_modules/@jridgewell/trace-mapping')
  )
  const maps = new Map()
  const load = (url) => {
    const file = path.join(dist, decodeURIComponent(new URL(url).pathname))
    if (!maps.has(file)) {
      const map = `${file}.map`
      maps.set(
        file,
        fs.existsSync(map) ? new TraceMap(fs.readFileSync(map, 'utf8')) : null
      )
    }
    return maps.get(file)
  }
  return (frame) => {
    if (!frame.url) return frame
    let map
    try {
      map = load(frame.url)
    } catch {
      return frame
    }
    if (!map) return frame
    const position = originalPositionFor(map, {
      line: frame.line,
      column: frame.column - 1,
    })
    if (!position.source) return frame
    return {
      fn: position.name ?? frame.fn,
      source: position.source.replace(
        /^.*?\/(src|node_modules|modules)\//,
        '$1/'
      ),
      line: position.line,
    }
  }
}

const hostGroup = (url, appOrigin) => {
  const { origin, hostname } = new URL(url)
  if (origin === appOrigin) return 'app (static)'
  if (/(^|\.)posthog\.com$|ww-api-r\./.test(hostname)) return 'PostHog'
  if (/revenuecat\.com$|revenue\.cat$|rev\.cat$/.test(hostname))
    return 'RevenueCat'
  if (/^help-search/.test(hostname)) return 'Help search'
  if (/^(maps|verify)(-dev)?\./.test(hostname)) return 'Frames (maps, verify)'
  if (/^api(-dev)?\.witnesswork\.app$|ww-proxy/.test(hostname)) return 'ww-api'
  if (/^(dev\.)?witnesswork\.app$/.test(hostname)) return 'Help Center site'
  if (/^(localhost|127\.0\.0\.1)$/.test(hostname)) return 'ww-api'
  return hostname
}

const routeOf = (url) => {
  const parsed = new URL(url)
  return `${parsed.host}${parsed.pathname}`
}

function summarize(phase, { appOrigin, symbolicate, bodies }) {
  const requests = [...phase.requests.values()]
    .sort((a, b) => a.seq - b.seq)
    .map((request) => {
      const frames = symbolicate
        ? request.stack.map((frame) =>
            frame.async ? frame : symbolicate(frame)
          )
        : request.stack
      const out = {
        ...request,
        group: hostGroup(request.url, appOrigin),
        stack: frames,
        durationMs:
          request.finishedAt == null
            ? null
            : request.finishedAt - request.startedAt,
      }
      delete out.pending
      delete out.hasPostData
      if (!bodies) {
        delete out.requestBody
        delete out.responseBody
      } else {
        if (out.requestBody)
          out.requestBody = scrub(out.requestBody).slice(0, 6000)
        if (out.responseBody)
          out.responseBody = scrub(out.responseBody).slice(0, 6000)
      }
      return out
    })
  return tally(
    phase.name,
    requests,
    [...phase.sockets.values()].map((socket) => ({
      ...socket,
      stack: symbolicate
        ? socket.stack.map((frame) =>
            frame.async ? frame : symbolicate(frame)
          )
        : socket.stack,
    }))
  )
}

export function tally(name, requests, sockets) {
  const network = requests.filter(
    (request) =>
      request.source === 'network' ||
      (request.source == null && !request.failed)
  )
  const sum = (list, field) =>
    list.reduce((total, request) => total + (request[field] ?? 0), 0)
  const groups = {}
  for (const request of network) {
    const group = (groups[request.group] ??= {
      requests: 0,
      sentBytes: 0,
      receivedWireBytes: 0,
      receivedDecodedBytes: 0,
    })
    group.requests++
    group.sentBytes += request.requestHeaderBytes + request.requestBodyBytes
    group.receivedWireBytes += request.wireBytes ?? 0
    group.receivedDecodedBytes += request.decodedBodyBytes ?? 0
  }
  const seen = new Map()
  for (const request of network) {
    if (request.type === 'Preflight' || request.target === 'service_worker')
      continue
    const id = `${request.method} ${routeOf(request.url)}`
    seen.set(id, (seen.get(id) ?? 0) + 1)
  }
  return {
    name,
    settledAtMs: Math.max(0, ...requests.map((r) => r.finishedAt ?? 0)),
    totals: {
      requests: requests.length,
      onNetwork: network.length,
      fromServiceWorker: requests.filter((r) => r.source === 'service-worker')
        .length,
      fromHttpCache: requests.filter(
        (r) => r.source === 'disk-cache' || r.source === 'memory-cache'
      ).length,
      preflights: network.filter((r) => r.type === 'Preflight').length,
      failed: requests.filter((r) => r.failed).length,
      sentBytes:
        sum(network, 'requestHeaderBytes') + sum(network, 'requestBodyBytes'),
      receivedWireBytes: sum(network, 'wireBytes'),
      receivedDecodedBytes: sum(network, 'decodedBodyBytes'),
    },
    groups,
    duplicates: Object.fromEntries([...seen].filter(([, count]) => count > 1)),
    requests,
    sockets: sockets.map((socket) => ({
      ...socket,
      sentBytes: socket.frames
        .filter((frame) => frame.direction === 'sent')
        .reduce((total, frame) => total + frame.bytes, 0),
      receivedBytes: socket.frames
        .filter((frame) => frame.direction === 'received')
        .reduce((total, frame) => total + frame.bytes, 0),
    })),
  }
}

const kb = (bytes) =>
  bytes == null
    ? '—'
    : bytes < 1000
      ? `${bytes} B`
      : `${(bytes / 1024).toFixed(1)} KB`

const trigger = (request) => {
  const own = request.stack.find(
    (frame) =>
      !frame.async &&
      (frame.source
        ? /^(src|modules)\//.test(frame.source)
        : frame.fn !== '(anonymous)')
  )
  if (!own) return request.initiator
  return own.source ? `${own.source}:${own.line} ${own.fn}` : own.fn
}

const isPrecache = (request) =>
  request.target === 'service_worker' && request.group === 'app (static)'

export function markdown(capture) {
  const lines = [
    `# Web network capture: ${capture.name}`,
    '',
    `- URL: ${capture.url}`,
    `- Captured: ${capture.capturedAt}`,
    `- Browser: ${capture.browser}`,
    '',
  ]
  for (const phase of capture.phases) {
    const { totals } = phase
    lines.push(
      `## ${phase.name} load`,
      '',
      `${totals.onNetwork} requests on the network (${totals.preflights} CORS preflights), ` +
        `${totals.fromServiceWorker} answered by the service worker, ${totals.fromHttpCache} by the HTTP cache, ` +
        `${totals.failed} failed. Sent ${kb(totals.sentBytes)}, received ${kb(totals.receivedWireBytes)} on the wire ` +
        `(${kb(totals.receivedDecodedBytes)} decoded). Last response at ${(phase.settledAtMs / 1000).toFixed(1)} s.`,
      '',
      '| Group | Requests | Sent | Received (wire) | Received (decoded) |',
      '| --- | ---: | ---: | ---: | ---: |',
      ...Object.entries(phase.groups).map(
        ([group, g]) =>
          `| ${group} | ${g.requests} | ${kb(g.sentBytes)} | ${kb(g.receivedWireBytes)} | ${kb(g.receivedDecodedBytes)} |`
      ),
      ''
    )
    const duplicates = Object.entries(phase.duplicates)
    if (duplicates.length)
      lines.push(
        '**Sent more than once:**',
        '',
        ...duplicates.map(([id, count]) => `- \`${id}\` ×${count}`),
        ''
      )
    lines.push(
      '| # | At | Method | URL | Status | From | Type | Sent | Wire | Decoded | Encoding | Cache-Control | Took | Trigger |',
      '| ---: | ---: | --- | --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |',
      ...phase.requests
        .filter((request) => !isPrecache(request))
        .map((request) => {
          const url = new URL(request.url)
          const shown =
            request.group === 'app (static)'
              ? url.pathname.replace(/([0-9a-f]{8})[0-9a-f]{24}/, '$1…')
              : `${url.host}${url.pathname}${url.search ? '?…' : ''}`
          return (
            `| ${request.seq} | ${request.startedAt} ms | ${request.method} | \`${shown.slice(0, 90)}\` | ` +
            `${request.failed ? `✗ ${request.failed}` : (request.status ?? '…')} | ${request.source ?? '—'} | ${request.type} | ` +
            `${kb(request.requestHeaderBytes + request.requestBodyBytes)} | ${kb(request.wireBytes)} | ${kb(request.decodedBodyBytes)} | ` +
            `${request.responseHeaders?.['content-encoding'] ?? '—'} | ${request.responseHeaders?.['cache-control'] ?? '—'} | ` +
            `${request.durationMs == null ? '…' : `${request.durationMs} ms`} | ${trigger(request).replace(/\|/g, '\\|')} |`
          )
        }),
      ''
    )
    const precache = phase.requests.filter(isPrecache)
    if (precache.length)
      lines.push(
        `**Service worker:** ${precache.length} more requests for the app's own files (its precache and what the page asked it for), ` +
          `${kb(precache.reduce((total, request) => total + (request.wireBytes ?? 0), 0))} on the wire. They aren't listed above.`,
        ''
      )
    for (const socket of phase.sockets) {
      const url = new URL(socket.url)
      lines.push(
        `**WebSocket** \`${url.host}${url.pathname}\` opened at ${socket.createdAt} ms ` +
          `(extensions: ${socket.responseHeaders?.['sec-websocket-extensions'] ?? 'none'}): ` +
          `${socket.frames.length} frames, sent ${kb(socket.sentBytes)}, received ${kb(socket.receivedBytes)}.`,
        '',
        ...socket.frames
          .slice(0, 20)
          .map(
            (frame) =>
              `- ${frame.at} ms ${frame.direction} ${frame.bytes} B: \`${frame.data.slice(0, 160)}\``
          ),
        ''
      )
    }
  }
  return lines.join('\n')
}

export function compare(before, after) {
  const lines = [`# ${before.name} → ${after.name}`, '']
  for (const phase of before.phases) {
    const other = after.phases.find(
      (candidate) => candidate.name === phase.name
    )
    if (!other) continue
    const row = (label, a, b, format = String) =>
      `| ${label} | ${format(a)} | ${format(b)} | ${b - a <= 0 ? '' : '+'}${format === kb ? kb(Math.abs(b - a)).replace(/^/, b - a < 0 ? '−' : '') : b - a} |`
    lines.push(
      `## ${phase.name} load`,
      '',
      '| | Before | After | Change |',
      '| --- | ---: | ---: | ---: |',
      row(
        'Requests on the network',
        phase.totals.onNetwork,
        other.totals.onNetwork
      ),
      row('CORS preflights', phase.totals.preflights, other.totals.preflights),
      row(
        'Sent more than once (routes)',
        Object.keys(phase.duplicates).length,
        Object.keys(other.duplicates).length
      ),
      row('Sent', phase.totals.sentBytes, other.totals.sentBytes, kb),
      row(
        'Received (wire)',
        phase.totals.receivedWireBytes,
        other.totals.receivedWireBytes,
        kb
      ),
      ''
    )
    const count = (capture) => {
      const counts = new Map()
      for (const request of capture.requests) {
        if (request.source && request.source !== 'network') continue
        const id = `${request.type === 'Preflight' ? 'OPTIONS (preflight)' : request.method} ${routeOf(request.url).replace(/([0-9a-f]{8})[0-9a-f]{24}/, '$1…')}`
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
      return counts
    }
    const a = count(phase)
    const b = count(other)
    const changed = [...new Set([...a.keys(), ...b.keys()])]
      .filter((id) => (a.get(id) ?? 0) !== (b.get(id) ?? 0))
      .sort()
    if (changed.length)
      lines.push(
        '| Request | Before | After |',
        '| --- | ---: | ---: |',
        ...changed.map(
          (id) => `| \`${id}\` | ${a.get(id) ?? 0} | ${b.get(id) ?? 0} |`
        ),
        ''
      )
  }
  return lines.join('\n')
}

const flag = (args, name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}

async function capture(args) {
  const url = flag(args, 'url')
  const name = flag(args, 'name')
  if (!url || !name)
    throw new Error('capture needs --url <app url> and --name <name>')
  const out = path.resolve(
    flag(args, 'out', path.join(ROOT, '.verify/artifacts/web-network'))
  )
  const temporary = !flag(args, 'profile')
  const profile = path.resolve(
    flag(
      args,
      'profile',
      fs.mkdtempSync(path.join(os.tmpdir(), 'ww-web-network-'))
    )
  )
  const settleMs = Number(flag(args, 'settle', 10)) * 1000
  const maxMs = Number(flag(args, 'max', 90)) * 1000
  const phases = flag(args, 'phases', 'cold,warm').split(',')
  const bodies = args.includes('--bodies')
  const symbolicate = symbolicator(flag(args, 'maps'))
  const appOrigin = new URL(url).origin
  fs.mkdirSync(out, { recursive: true })
  fs.mkdirSync(profile, { recursive: true })

  const { cdp, child } = await launch({
    profile,
    headed: args.includes('--headed'),
  })
  try {
    const record = recorder(cdp)
    await cdp.send('Target.setDiscoverTargets', { discover: true })

    await cdp.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    })
    const { product } = await cdp.send('Browser.getVersion')
    let sessionId
    for (let tries = 0; tries < 40 && !sessionId; tries++) {
      sessionId = [...record.targets].find(
        ([, info]) => info.type === 'page'
      )?.[0]
      if (!sessionId) await sleep(250)
    }
    if (!sessionId) throw new Error('Chromium opened no page')
    const page = (method, params) => cdp.send(method, params, sessionId)
    await page('Page.enable')

    const results = []
    for (const phase of phases) {
      if (phase === 'cold') {
        await page('Page.navigate', { url: 'about:blank' })
        await sleep(500)
        await page('Network.clearBrowserCache')
        await page('Storage.clearDataForOrigin', {
          origin: appOrigin,
          storageTypes: 'service_workers,cache_storage',
        })
        await sleep(500)
        record.begin('cold', { bodies })
        await page('Page.navigate', { url })
      } else {
        record.begin(phase, { bodies })
        if (results.length) await page('Page.reload')
        else await page('Page.navigate', { url })
      }
      results.push(
        summarize(await record.settle({ settleMs, maxMs }), {
          appOrigin,
          symbolicate,
          bodies,
        })
      )
      if (flag(args, 'shots')) {
        await page('Page.bringToFront').catch(() => undefined)
        const shot = await page('Page.captureScreenshot', {
          format: 'png',
        }).catch(() => null)
        if (shot)
          fs.writeFileSync(
            path.join(out, `${name}-${phase}.png`),
            Buffer.from(shot.data, 'base64')
          )
      }
    }
    const result = {
      name,
      url,
      capturedAt: new Date().toISOString(),
      browser: product,
      settleSeconds: settleMs / 1000,
      phases: results,
    }
    fs.writeFileSync(
      path.join(out, `${name}.json`),
      JSON.stringify(result, null, 1)
    )
    fs.writeFileSync(path.join(out, `${name}.md`), markdown(result))
    for (const phase of results)
      console.log(
        `${phase.name}: ${phase.totals.onNetwork} on the network (${phase.totals.preflights} preflights), ` +
          `sent ${kb(phase.totals.sentBytes)}, received ${kb(phase.totals.receivedWireBytes)}; ` +
          `${Object.keys(phase.duplicates).length} routes sent more than once`
      )
    console.log(path.join(out, `${name}.md`))
  } finally {
    await cdp.send('Browser.close').catch(() => undefined)
    cdp.close()
    await new Promise((resolve) => {
      child.once('exit', resolve)
      setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 5000)
    })
    if (temporary)
      fs.rmSync(profile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 400,
      })
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'capture') return capture(args)
  if (command === 'report') {
    const file = path.resolve(args[0])
    const capture = JSON.parse(fs.readFileSync(file, 'utf8'))
    const only = flag(args, 'phases')?.split(',')
    capture.phases = capture.phases
      .filter((phase) => !only || only.includes(phase.name))
      .map((phase) => {
        const seen = new Set()
        const requests = phase.requests.filter((request) => {
          const id = `${request.target} ${request.method} ${request.url} ${request.startedAt}`
          if (request.target !== 'service_worker') return true
          if (seen.has(id)) return false
          seen.add(id)
          return true
        })
        return tally(phase.name, requests, phase.sockets)
      })
    const out = flag(args, 'out', file.replace(/\.json$/, '.md'))
    fs.writeFileSync(out, markdown(capture))
    if (args.includes('--rewrite'))
      fs.writeFileSync(file, JSON.stringify(capture, null, 1))
    console.log(out)
    return
  }
  if (command === 'compare') {
    const [before, after] = args
      .slice(0, 2)
      .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
    const text = compare(before, after)
    const out = flag(args, 'out')
    if (out) fs.writeFileSync(out, text)
    console.log(text)
    return
  }
  console.error(
    'Usage: node scripts/perf/web-network.mjs capture --url <url> --name <name> [--profile <dir>] [--out <dir>] [--maps <dist>] [--settle <s>] [--max <s>] [--phases cold,warm] [--bodies] [--shots 1] [--headed]\n' +
      '       node scripts/perf/web-network.mjs compare <before.json> <after.json> [--out <file>]\n' +
      '       node scripts/perf/web-network.mjs report <capture.json> [--phases cold] [--out <file>] [--rewrite]'
  )
  process.exit(1)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.stack ?? String(error))
    process.exit(1)
  })
