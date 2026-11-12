import { randomBytes as nodeRandomBytes, randomUUID } from 'node:crypto'
import http from 'node:http'
import { fromB64u, toB64u } from '@/lib/bytes'
import type { AttestedRequest } from '@/lib/attestation/appAttest'
import { createSpacesClient } from '@/lib/sharedSpaces/client'
import { openRecordWithKey, scopedRecordKey } from '@/lib/sharedSpaces/records'
import { createAccountSessions } from '@/lib/serverAccount/session'
import { createFakeSpacesServer } from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import {
  createGuestLinkSpace,
  type GuestLinkSpace,
  putOwnerDoor,
  type SeedStreet,
} from '@/features/territories/guest/testing/guestLinkSpace'

const randomBytes = (length: number) => new Uint8Array(nodeRandomBytes(length))

const randomIp = () => `10.${Array.from(nodeRandomBytes(3)).join('.')}`

export type SavedLink = {
  api: string
  web: string
  seed: string
  spaceKey: string
  auth: GuestLinkSpace['auth']
  linkId: string
  linkSecret: string
  fragment: string
  scopes: string[]
  streetIds: string[]
  ownerName: string
  houseRecords: boolean
  title: string
  expiresAt: number
  url: string
}

function spacesFor(api: string, seed: Uint8Array, bypass: string) {
  const fetchImpl = ((url: string, init: RequestInit = {}) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        'cf-connecting-ip': randomIp(),
      },
    })) as typeof fetch
  let stored: string | null = null
  const sessions = createAccountSessions({
    baseUrl: api,
    now: Date.now,
    randomBytes,
    attestation: {
      assert: <T>(request: AttestedRequest<T>) =>
        request.submit({ kind: 'devBypass', token: bypass }),
    },
    store: {
      read: async () => stored,
      write: async (value) => {
        stored = value
      },
    },
    accountKey: async () => seed,
    fetchImpl,
  })
  return createSpacesClient({
    baseUrl: api,
    authorize: (run, { signal }) =>
      sessions.withSession(run, { accountKey: seed, signal }),
    fetchImpl,
  })
}

const restore = (saved: SavedLink): GuestLinkSpace => ({
  ...saved,
  spaceKey: fromB64u(saved.spaceKey),
  linkSecret: fromB64u(saved.linkSecret),
})

export async function createLink({
  api,
  web,
  bypass,
  streets,
  linkStreets,
  houseRecords,
  hours,
  ownerName,
}: {
  api: string
  web: string
  bypass: string
  streets: SeedStreet[]
  linkStreets?: number[]
  houseRecords: boolean
  hours: number
  ownerName: string
}): Promise<SavedLink> {
  const seed = randomBytes(32)
  const space = await createGuestLinkSpace(
    {
      client: spacesFor(api, seed, bypass),
      seed,
      randomBytes,
      randomUUID,
      now: Date.now,
    },
    {
      streets,
      linkStreets,
      houseRecords,
      ownerName,
      lifetimeMs: hours * 60 * 60 * 1000,
    }
  )
  return {
    ...space,
    api,
    web,
    seed: toB64u(seed),
    spaceKey: toB64u(space.spaceKey),
    linkSecret: toB64u(space.linkSecret),
    url: `${web}/territories/guest#${space.fragment}`,
  }
}

export async function putDoor(
  saved: SavedLink,
  bypass: string,
  door: {
    street: number
    label: string
    outcome: 'notHome' | 'spoke' | 'doNotCall'
    byName?: string
  }
) {
  return putOwnerDoor(
    {
      client: spacesFor(saved.api, fromB64u(saved.seed), bypass),
      randomBytes,
      randomUUID,
      now: Date.now,
    },
    restore(saved),
    door
  )
}

export async function endLink(saved: SavedLink, bypass: string) {
  await spacesFor(saved.api, fromB64u(saved.seed), bypass).endLink(
    saved.auth,
    saved.linkId
  )
}

export async function readRecords(saved: SavedLink, bypass: string) {
  const client = spacesFor(saved.api, fromB64u(saved.seed), bypass)
  const spaceKey = fromB64u(saved.spaceKey)
  const out: Record<string, unknown>[] = []
  await client.syncFrom(saved.auth, 0, (page) => {
    for (const record of page.records) {
      if (record.recordId.startsWith('g.') || record.recordId.startsWith('k.'))
        continue
      try {
        const plaintext = openRecordWithKey(
          scopedRecordKey(spaceKey, record.recordId),
          {
            spaceId: saved.auth.spaceId,
            epoch: record.epoch,
            recordId: record.recordId,
            deleted: record.deleted,
            stamp: record.stamp,
          },
          record.blob
        )
        out.push({
          recordId: record.recordId,
          deleted: record.deleted,
          ...plaintext,
        })
      } catch {
        out.push({ recordId: record.recordId, unreadable: true })
      }
    }
  })
  return out
}

export function serveFake(port: number, host = '127.0.0.1') {
  let offset = 0
  const server = createFakeSpacesServer({ now: () => Date.now() + offset })
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-expose-headers': 'Date, Retry-After',
  }
  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${host}:${port}`)
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors)
        return res.end()
      }
      if (url.pathname === '/__fake/advance') {
        offset += Number(url.searchParams.get('ms') ?? 0)
        res.writeHead(200, { ...cors, 'content-type': 'application/json' })
        return res.end(JSON.stringify({ ok: true, offset }))
      }
      if (url.pathname === '/__fake/guests') {
        server.state.guests = url.searchParams.get('on') !== '0'
        res.writeHead(200, { ...cors, 'content-type': 'application/json' })
        return res.end(
          JSON.stringify({ ok: true, guests: server.state.guests })
        )
      }
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const body = Buffer.concat(chunks)
      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(req.headers))
        if (typeof value === 'string') headers[key] = value
      const response = await server.fetchImpl(url.toString(), {
        method: req.method,
        headers,
        body: body.length ? body.toString('utf8') : undefined,
      })
      const out: Record<string, string> = { ...cors }
      response.headers.forEach((value, key) => {
        out[key] = value
      })
      out.date ??= new Date(Date.now() + offset).toUTCString()
      res.writeHead(response.status, out)
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      res.writeHead(500, cors)
      res.end(String(error))
    }
  })
  return new Promise<http.Server>((resolve) =>
    httpServer.listen(port, host, () => resolve(httpServer))
  )
}
