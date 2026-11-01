import {
  SyncTransportError,
  SyncTransportErrorCode,
} from '@/lib/syncTransport/types'

export const DRIVE_API_ORIGIN = 'https://www.googleapis.com'

export type DriveFile = {
  id: string
  name: string

  modifiedAt: number

  size: number | null
}

export type DriveUploadResult = {
  status: number
  body: string

  retryAfter?: string | null
}

type DriveResponse = { body: string; headers: Headers }

export type DriveFileTransfer = {
  upload(args: {
    url: string
    sourcePath: string
    headers: Record<string, string>
  }): Promise<DriveUploadResult>
  download(args: {
    url: string
    destinationPath: string
    headers: Record<string, string>
  }): Promise<{
    status: number

    body?: string
    retryAfter?: string | null
  }>
}

export type DriveApiOptions = {
  origin?: string

  getToken(options: { refresh: boolean; rejected?: string }): Promise<string>
  fetch?: typeof fetch
  transfer: DriveFileTransfer
  sleep?: (ms: number) => Promise<void>
}

const FILE_FIELDS = 'id,name,modifiedTime,size'
const REQUEST_TIMEOUT_MS = 30_000

const MAX_RETRIES = 4
const MAX_RETRY_DELAY_MS = 32_000

export const RESUMABLE_JSON_BYTES = 4 * 1024 * 1024

const query = (params: Record<string, string | undefined>): string =>
  Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')

type DriveFileResource = {
  id?: unknown
  name?: unknown
  modifiedTime?: unknown
  size?: unknown
}

export function driveFileFrom(resource: DriveFileResource): DriveFile {
  const modifiedAt =
    typeof resource.modifiedTime === 'string'
      ? Date.parse(resource.modifiedTime)
      : NaN
  if (
    typeof resource.id !== 'string' ||
    typeof resource.name !== 'string' ||
    !Number.isFinite(modifiedAt)
  ) {
    throw new SyncTransportError('unknown', 'Malformed Drive file resource')
  }
  const size =
    typeof resource.size === 'string' ? Number(resource.size) : Number.NaN
  return {
    id: resource.id,
    name: resource.name,
    modifiedAt,
    size: Number.isFinite(size) ? size : null,
  }
}

export function errorReason(body: string | undefined): string | null {
  if (!body) return null
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        errors?: Array<{ reason?: unknown }>
        details?: Array<{ reason?: unknown }>
        status?: unknown
      }
    }
    const reason =
      parsed.error?.errors?.[0]?.reason ?? parsed.error?.details?.[0]?.reason
    if (typeof reason === 'string') return reason
    return typeof parsed.error?.status === 'string' ? parsed.error.status : null
  } catch {
    return null
  }
}

export function retryAfterMs(
  value: string | null | undefined,
  now = Date.now()
): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, at - now) : null
}

export function utf8Length(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

const AUTH_REASONS = new Set([
  'authError',
  'insufficientPermissions',
  'insufficientScopes',
  'insufficientFilePermissions',
  'appNotAuthorizedToFile',
  'PERMISSION_DENIED',
  'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
  'forbidden',
])

const RATE_LIMIT_REASONS = new Set([
  'userRateLimitExceeded',
  'rateLimitExceeded',
  'sharingRateLimitExceeded',

  'quotaExceeded',
  'dailyLimitExceeded',
  'RATE_LIMIT_EXCEEDED',
  'RESOURCE_EXHAUSTED',
])

export function classifyDriveError(
  status: number,
  reason: string | null
): SyncTransportErrorCode {
  if (status === 401) return 'unauthorized'
  if (status === 404) return 'not-found'
  if (status === 429) return 'rate-limited'
  if (status === 403) {
    if (reason === 'storageQuotaExceeded') return 'storage-full'
    if (reason !== null && RATE_LIMIT_REASONS.has(reason)) return 'rate-limited'
    if (reason !== null && AUTH_REASONS.has(reason)) return 'unauthorized'

    return 'unknown'
  }
  if (status === 408 || status >= 500) return 'network'
  return 'unknown'
}

const retryable = (code: SyncTransportErrorCode) =>
  code === 'rate-limited' || code === 'network'

export function createDriveApi(options: DriveApiOptions) {
  const origin = options.origin ?? DRIVE_API_ORIGIN
  const fetchImpl = options.fetch ?? fetch
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  async function withRetries<T>(
    attempt: (token: string) => Promise<T>
  ): Promise<T> {
    let refreshed = false
    let rejected: string | undefined
    for (let retry = 0; ; retry++) {
      const token = await options.getToken(
        rejected ? { refresh: true, rejected } : { refresh: false }
      )
      rejected = undefined
      try {
        return await attempt(token)
      } catch (error) {
        const code =
          error instanceof SyncTransportError ? error.code : 'network'
        if (code === 'unauthorized' && !refreshed) {
          refreshed = true
          rejected = token
          retry--
          continue
        }
        const asked =
          error instanceof SyncTransportError ? error.retryAfterMs : null
        const delay = Math.max(
          asked ?? 0,
          1_000 * 2 ** retry + Math.floor(Math.random() * 1_000)
        )
        if (
          !retryable(code) ||
          retry >= MAX_RETRIES ||
          (asked ?? 0) > MAX_RETRY_DELAY_MS
        ) {
          throw error instanceof SyncTransportError
            ? error
            : new SyncTransportError('network', String(error))
        }
        await sleep(Math.min(delay, MAX_RETRY_DELAY_MS))
      }
    }
  }

  async function send(
    token: string,
    path: string,
    init: { method: string; headers?: Record<string, string>; body?: string }
  ): Promise<DriveResponse> {
    const controller =
      typeof AbortController === 'undefined' ? null : new AbortController()
    const timer = controller
      ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      : null

    const url = /^https?:/.test(path) ? path : `${origin}${path}`
    let status: number
    let body: string
    let headers: Headers
    try {
      const response = await fetchImpl(url, {
        method: init.method,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
        body: init.body,
        signal: controller?.signal,
      })
      status = response.status
      headers = response.headers
      body = await response.text()
    } catch (error) {
      throw new SyncTransportError(
        'network',
        `Drive ${init.method} failed: ${String(error)}`
      )
    } finally {
      if (timer) clearTimeout(timer)
    }
    if (status >= 200 && status < 300) return { body, headers }
    throw driveError(
      `Drive ${init.method}`,
      status,
      body,
      headers.get('retry-after')
    )
  }

  function driveError(
    label: string,
    status: number,
    body: string | undefined,
    retryAfter: string | null | undefined
  ): SyncTransportError {
    const reason = errorReason(body)
    return new SyncTransportError(
      classifyDriveError(status, reason),
      `${label} ${status}${reason ? ` ${reason}` : ''}`,
      retryAfterMs(retryAfter)
    )
  }

  const parse = <T>(response: DriveResponse): T => {
    try {
      return JSON.parse(response.body) as T
    } catch {
      throw new SyncTransportError('unknown', 'Drive returned malformed JSON')
    }
  }

  const request = (
    path: string,
    init: { method: string; headers?: Record<string, string>; body?: string }
  ) => withRetries((token) => send(token, path, init))

  function createJsonResumable(name: string, json: string): Promise<DriveFile> {
    return withRetries(async (token) => {
      const session = await send(
        token,
        `/upload/drive/v3/files?${query({
          uploadType: 'resumable',
          fields: FILE_FIELDS,
        })}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            parents: ['appDataFolder'],
            mimeType: 'application/json',
          }),
        }
      )
      const location = session.headers.get('location')
      if (!location)
        throw new SyncTransportError('unknown', 'Drive gave no upload URL')
      return driveFileFrom(
        parse(
          await send(token, location, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: json,
          })
        )
      )
    })
  }

  return {
    async listFiles(): Promise<DriveFile[]> {
      const files: DriveFile[] = []
      let pageToken: string | undefined
      do {
        const response = await request(
          `/drive/v3/files?${query({
            spaces: 'appDataFolder',
            fields: `nextPageToken,files(${FILE_FIELDS})`,
            pageSize: '1000',
            pageToken,
          })}`,
          { method: 'GET' }
        )
        const body = parse<{
          files?: DriveFileResource[]
          nextPageToken?: unknown
        }>(response)
        for (const resource of body.files ?? [])
          files.push(driveFileFrom(resource))
        pageToken =
          typeof body.nextPageToken === 'string'
            ? body.nextPageToken
            : undefined
      } while (pageToken)
      return files
    },

    async downloadText(id: string): Promise<string> {
      const response = await request(
        `/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
        { method: 'GET' }
      )
      return response.body
    },

    async createJson(name: string, json: string): Promise<DriveFile> {
      if (utf8Length(json) > RESUMABLE_JSON_BYTES)
        return createJsonResumable(name, json)
      const boundary = `witness-work-${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2)}`
      const metadata = JSON.stringify({
        name,
        parents: ['appDataFolder'],
        mimeType: 'application/json',
      })
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${json}\r\n` +
        `--${boundary}--`
      const response = await request(
        `/upload/drive/v3/files?${query({
          uploadType: 'multipart',
          fields: FILE_FIELDS,
        })}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      )
      return driveFileFrom(parse(response))
    },

    async updateJson(id: string, json: string): Promise<DriveFile> {
      const response = await request(
        `/upload/drive/v3/files/${encodeURIComponent(id)}?${query({
          uploadType: 'media',
          fields: FILE_FIELDS,
        })}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: json,
        }
      )
      return driveFileFrom(parse(response))
    },

    async deleteFile(id: string): Promise<void> {
      try {
        await request(`/drive/v3/files/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
      } catch (error) {
        if (error instanceof SyncTransportError && error.code === 'not-found')
          return
        throw error
      }
    },

    async accountId(): Promise<string> {
      const response = await request(
        `/drive/v3/about?${query({ fields: 'user(permissionId)' })}`,
        { method: 'GET' }
      )
      const body = parse<{
        user?: { permissionId?: unknown }
      }>(response)
      const id = body.user?.permissionId
      if (typeof id !== 'string' || !id)
        throw new SyncTransportError('unknown', 'Drive returned no account')
      return id
    },

    async uploadBinary(args: {
      existingId: string | null
      name: string
      sourcePath: string
    }): Promise<DriveFile> {
      return withRetries(async (token) => {
        const path = args.existingId
          ? `/upload/drive/v3/files/${encodeURIComponent(args.existingId)}`
          : '/upload/drive/v3/files'
        const session = await send(
          token,
          `${path}?${query({ uploadType: 'resumable', fields: FILE_FIELDS })}`,
          {
            method: args.existingId ? 'PATCH' : 'POST',
            headers: {
              'Content-Type': 'application/json; charset=UTF-8',
              'X-Upload-Content-Type': 'image/jpeg',
            },
            body: JSON.stringify(
              args.existingId
                ? {}
                : {
                    name: args.name,
                    parents: ['appDataFolder'],
                    mimeType: 'image/jpeg',
                  }
            ),
          }
        )
        const location = session.headers.get('location')
        if (!location)
          throw new SyncTransportError('unknown', 'Drive gave no upload URL')
        let result: DriveUploadResult
        try {
          result = await options.transfer.upload({
            url: location,
            sourcePath: args.sourcePath,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'image/jpeg',
            },
          })
        } catch (error) {
          throw new SyncTransportError(
            'network',
            `Drive upload failed: ${String(error)}`
          )
        }
        if (result.status < 200 || result.status >= 300)
          throw driveError(
            'Drive upload',
            result.status,
            result.body,
            result.retryAfter
          )
        return driveFileFrom(JSON.parse(result.body))
      })
    },

    async downloadBinary(id: string, destinationPath: string): Promise<void> {
      await withRetries(async (token) => {
        let result: Awaited<ReturnType<DriveFileTransfer['download']>>
        try {
          result = await options.transfer.download({
            url: `${origin}/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
            destinationPath,
            headers: { Authorization: `Bearer ${token}` },
          })
        } catch (error) {
          throw new SyncTransportError(
            'network',
            `Drive download failed: ${String(error)}`
          )
        }
        if (result.status < 200 || result.status >= 300)
          throw driveError(
            'Drive download',
            result.status,
            result.body,
            result.retryAfter
          )
      })
    },
  }
}

export type DriveApi = ReturnType<typeof createDriveApi>
