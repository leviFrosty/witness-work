#!/usr/bin/env node

import http from 'node:http'
import { createFakeGoogleDrive } from './fakeGoogleDrive.ts'

const port = Number(process.argv[2] ?? 8795)
const origin = `http://localhost:${port}`
const drive = createFakeGoogleDrive({ origin })

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body, null, 2))
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', origin)
      if (url.pathname === '/__fake/files') {
        const account = url.searchParams.get('account') ?? 'family'
        return send(
          res,
          200,
          drive.files(account).map((f) => ({
            name: f.name,
            bytes: f.content.length,
            modifiedAt: new Date(f.modifiedAt).toISOString(),
          }))
        )
      }
      if (url.pathname === '/__fake/quota' && req.method === 'POST') {
        const bytes = url.searchParams.get('bytes')
        drive.setQuota(
          url.searchParams.get('account') ?? 'family',
          bytes === null ? undefined : Number(bytes)
        )
        return send(res, 200, { ok: true })
      }
      if (url.pathname === '/__fake/fail' && req.method === 'POST') {
        if (url.searchParams.get('clear')) {
          drive.clearFaults()
          return send(res, 200, { ok: true })
        }
        const path = url.searchParams.get('path') ?? '/'
        const status = Number(url.searchParams.get('status') ?? 503)
        const reason = url.searchParams.get('reason') ?? undefined
        const count = Number(url.searchParams.get('count') ?? 1)
        for (let i = 0; i < count; i++)
          drive.failNext(
            (request) => new URL(request.url).pathname.startsWith(path),
            status,
            reason
          )
        return send(res, 200, { ok: true })
      }
      if (url.pathname === '/__fake/log') return send(res, 200, drive.log)
      if (url.pathname === '/__fake/reset' && req.method === 'POST') {
        drive.reset()
        return send(res, 200, { ok: true })
      }
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = Buffer.concat(chunks)
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers))
        if (typeof value === 'string') headers.set(key, value)
      const response = await drive.handle(
        new Request(url, {
          method: req.method,
          headers,
          body:
            req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        })
      )
      const out = Buffer.from(await response.arrayBuffer())
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(out)
      console.log(`${req.method} ${url.pathname} → ${response.status}`)
    } catch (error) {
      console.error(error)
      send(res, 500, {
        error: { code: 500, errors: [{ reason: 'backendError' }] },
      })
    }
  })
  .listen(port, () => console.log(`fake Google Drive on ${origin}`))
