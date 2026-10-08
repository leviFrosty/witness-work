#!/usr/bin/env node
// Serves the in-memory Google Drive fake (fakeGoogleDrive.ts) over HTTP so
// Android dev builds on emulators can sync through it without a Google
// Account. Point a dev build at it with
//
//   adb -s <serial> reverse tcp:<port> tcp:<port>
//   wwv eval '__WW_DEV__.fakeGoogleDrive({ origin: "http://localhost:<port>", account: "family" })'
//
// then turn on Google Drive Sync in Settings. Each `account` is a separate
// Google Account with its own app data folder.
//
// Inspection endpoints (not part of Drive):
//   GET  /__fake/files?account=family   names, sizes and modified times
//   POST /__fake/quota?account=family&bytes=10   (omit bytes to lift it)
//   POST /__fake/reset
//
// Usage: node scripts/verify/fake-google-drive-server.mjs [port]
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
