/**
 * An in-memory stand-in for the slice of the Google Drive REST API (v3) that
 * WitnessWork's Android sync uses (`src/lib/syncTransport/googleDrive`):
 * listing, reading, creating, updating and deleting files in the app data
 * folder, resumable uploads, and `about.get`. Unit tests call `fetch` directly;
 * `fake-google-drive-server.ts` serves it over HTTP so emulators can sync
 * through it without a Google Account.
 *
 * Each access token names an account (`fake:<permissionId>`, optionally
 * `fake:<permissionId>#<n>` to tell tokens apart), and each account has its own
 * app data folder, as Drive gives each Google Account its own. Like Drive,
 * names aren't unique: two creates with one name make two files.
 *
 * Plain, import-free TypeScript so Node can run it with type stripping.
 */

export type FakeDriveFile = {
  id: string
  name: string
  mimeType: string
  modifiedAt: number
  content: Uint8Array
}

type Fault = {
  match: (request: Request) => boolean
  status: number
  reason?: string
}

type UploadSession = {
  account: string
  existingId: string | null
  name: string
  mimeType: string
  fields: string | null
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function createFakeGoogleDrive(
  options: { origin?: string; maxPageSize?: number } = {}
) {
  const origin = options.origin ?? 'https://www.googleapis.com'
  const maxPageSize = options.maxPageSize ?? 1000
  const folders = new Map<string, Map<string, FakeDriveFile>>()
  const sessions = new Map<string, UploadSession>()
  const faults: Fault[] = []
  const quotas = new Map<string, number>()
  const revoked = new Set<string>()
  let nextId = 1
  let lastModified = 0
  /** Requests served, for tests that count calls. */
  const log: Array<{ method: string; path: string }> = []

  const now = () => (lastModified = Math.max(Date.now(), lastModified + 1))
  const folder = (account: string) => {
    let files = folders.get(account)
    if (!files) folders.set(account, (files = new Map()))
    return files
  }
  const used = (account: string) =>
    [...folder(account).values()].reduce((sum, f) => sum + f.content.length, 0)

  const json = (status: number, body: unknown, headers = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    })
  const error = (status: number, reason: string) =>
    json(status, {
      error: { code: status, message: reason, errors: [{ reason }] },
    })

  const resource = (file: FakeDriveFile) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: new Date(file.modifiedAt).toISOString(),
    size: String(file.content.length),
  })

  function accountOf(request: Request): string | null {
    const header = request.headers.get('authorization') ?? ''
    const match = /^Bearer fake:([^#]+)(?:#.*)?$/.exec(header)
    if (!match || revoked.has(match[1])) return null
    return match[1]
  }

  function store(
    account: string,
    file: Omit<FakeDriveFile, 'modifiedAt'>
  ): FakeDriveFile | Response {
    const files = folder(account)
    const previous = files.get(file.id)?.content.length ?? 0
    const quota = quotas.get(account)
    if (
      quota !== undefined &&
      used(account) - previous + file.content.length > quota
    )
      return error(403, 'storageQuotaExceeded')
    const saved = { ...file, modifiedAt: now() }
    files.set(file.id, saved)
    return saved
  }

  /** Splits a `multipart/related` body into its metadata and content. */
  function multipart(body: string, contentType: string) {
    const boundary = /boundary=([^;]+)/.exec(contentType)?.[1]
    if (!boundary) return null
    const parts = body
      .split(`--${boundary}`)
      .slice(1, -1)
      .map((part) => part.replace(/^\r\n/, '').replace(/\r\n$/, ''))
      .map((part) => part.slice(part.indexOf('\r\n\r\n') + 4))
    if (parts.length !== 2) return null
    return { metadata: JSON.parse(parts[0]), content: parts[1] }
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    log.push({ method: request.method, path })
    const fault = faults.findIndex((f) => f.match(request))
    if (fault >= 0) {
      const [{ status, reason }] = faults.splice(fault, 1)
      return error(status, reason ?? 'backendError')
    }

    const session = /^\/upload\/sessions\/(.+)$/.exec(path)
    if (session && request.method === 'PUT') {
      const upload = sessions.get(session[1])
      if (!upload) return error(404, 'notFound')
      sessions.delete(session[1])
      const content = new Uint8Array(await request.arrayBuffer())
      const saved = store(upload.account, {
        id: upload.existingId ?? `file-${nextId++}`,
        name: upload.name,
        mimeType: upload.mimeType,
        content,
      })
      return saved instanceof Response ? saved : json(200, resource(saved))
    }

    const account = accountOf(request)
    if (!account) return error(401, 'authError')
    const files = folder(account)

    if (path === '/drive/v3/about' && request.method === 'GET')
      return json(200, { user: { permissionId: account } })

    if (path === '/drive/v3/files' && request.method === 'GET') {
      if (url.searchParams.get('spaces') !== 'appDataFolder')
        return error(403, 'insufficientScopes')
      const all = [...files.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
      const size = Math.min(
        Number(url.searchParams.get('pageSize') ?? 100),
        maxPageSize
      )
      const start = Number(url.searchParams.get('pageToken') ?? 0)
      const page = all.slice(start, start + size)
      return json(200, {
        files: page.map(resource),
        ...(start + size < all.length
          ? { nextPageToken: String(start + size) }
          : {}),
      })
    }

    const file = /^\/drive\/v3\/files\/([^/]+)$/.exec(path)
    if (file) {
      const existing = files.get(decodeURIComponent(file[1]))
      if (!existing) return error(404, 'notFound')
      if (request.method === 'DELETE') {
        files.delete(existing.id)
        return new Response(null, { status: 204 })
      }
      if (request.method === 'GET' && url.searchParams.get('alt') === 'media')
        return new Response(existing.content.slice(), { status: 200 })
      if (request.method === 'GET') return json(200, resource(existing))
    }

    const upload = /^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/.exec(path)
    if (upload) {
      const existingId = upload[1] ? decodeURIComponent(upload[1]) : null
      const existing = existingId ? files.get(existingId) : undefined
      if (existingId && !existing) return error(404, 'notFound')
      const type = url.searchParams.get('uploadType')
      if (type === 'resumable') {
        const metadata = JSON.parse((await request.text()) || '{}')
        const id = `session-${nextId++}`
        sessions.set(id, {
          account,
          existingId,
          name: existing?.name ?? metadata.name,
          mimeType:
            request.headers.get('x-upload-content-type') ??
            metadata.mimeType ??
            'application/octet-stream',
          fields: url.searchParams.get('fields'),
        })
        return new Response(null, {
          status: 200,
          headers: { Location: `${origin}/upload/sessions/${id}` },
        })
      }
      if (type === 'multipart' && !existingId && request.method === 'POST') {
        const parts = multipart(
          await request.text(),
          request.headers.get('content-type') ?? ''
        )
        if (!parts || parts.metadata.parents?.[0] !== 'appDataFolder')
          return error(400, 'badRequest')
        const saved = store(account, {
          id: `file-${nextId++}`,
          name: parts.metadata.name,
          mimeType: parts.metadata.mimeType ?? 'application/octet-stream',
          content: encoder.encode(parts.content),
        })
        return saved instanceof Response ? saved : json(200, resource(saved))
      }
      if (type === 'media' && existing && request.method === 'PATCH') {
        const saved = store(account, {
          ...existing,
          content: new Uint8Array(await request.arrayBuffer()),
        })
        return saved instanceof Response ? saved : json(200, resource(saved))
      }
    }
    return error(400, 'badRequest')
  }

  return {
    origin,
    handle,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
      handle(new Request(input, init))) as typeof fetch,
    log,
    /** The account's files, newest first. */
    files(account: string): FakeDriveFile[] {
      return [...folder(account).values()].sort(
        (a, b) => b.modifiedAt - a.modifiedAt
      )
    },
    text(account: string, name: string): string | null {
      const file = this.files(account).find((f) => f.name === name)
      return file ? decoder.decode(file.content) : null
    },
    /** Adds a file as another client would, e.g. a duplicate name. */
    put(account: string, name: string, content: string): FakeDriveFile {
      const saved = store(account, {
        id: `file-${nextId++}`,
        name,
        mimeType: 'application/json',
        content: encoder.encode(content),
      })
      if (saved instanceof Response) throw new Error('quota')
      return saved
    },
    /** The next matching request fails with `status` and Drive's `reason`. */
    failNext(
      match: (request: Request) => boolean,
      status: number,
      reason?: string
    ) {
      faults.push({ match, status, reason })
    },
    /** Drops every fault `failNext` queued that hasn't fired yet. */
    clearFaults() {
      faults.length = 0
    },
    setQuota(account: string, bytes: number | undefined) {
      if (bytes === undefined) quotas.delete(account)
      else quotas.set(account, bytes)
    },
    /** Tokens for `account` stop working, as after revoking access. */
    revoke(account: string) {
      revoked.add(account)
    },
    reset() {
      folders.clear()
      sessions.clear()
      faults.length = 0
      quotas.clear()
      revoked.clear()
      log.length = 0
    },
  }
}

export type FakeGoogleDrive = ReturnType<typeof createFakeGoogleDrive>
