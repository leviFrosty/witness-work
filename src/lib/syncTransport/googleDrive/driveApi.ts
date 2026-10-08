import {
  SyncTransportError,
  SyncTransportErrorCode,
} from '@/lib/syncTransport/types'

/**
 * The slice of the Google Drive REST API (v3) that sync uses, confined to the
 * hidden app data folder (`spaces=appDataFolder`, scope `drive.appdata`). No
 * other folder of the user's Drive is reachable with that scope.
 *
 * Every call carries a fresh OAuth access token from `getToken`. A 401 asks for
 * a refreshed token once; throttling and server errors back off and retry a few
 * times; everything else is classified into a `SyncTransportError`.
 */

export const DRIVE_API_ORIGIN = 'https://www.googleapis.com'

export type DriveFile = {
  id: string
  name: string
  /** `modifiedTime` in epoch ms. */
  modifiedAt: number
  /** Bytes; null for files Drive reports without a size. */
  size: number | null
}

export type DriveUploadResult = { status: number; body: string }

/** A successful response, read in full within the request timeout. */
type DriveResponse = { body: string; headers: Headers }

/**
 * File-path transfers, so photo bytes never cross the JS bridge. Production
 * passes `expo-file-system`; tests pass an in-memory fake.
 */
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
  }): Promise<{ status: number }>
}

export type DriveApiOptions = {
  origin?: string
  /**
   * An access token for `drive.appdata`. `refresh` asks for a new one after
   * Drive rejected `rejected` (expired or revoked).
   */
  getToken(options: { refresh: boolean; rejected?: string }): Promise<string>
  fetch?: typeof fetch
  transfer: DriveFileTransfer
  sleep?: (ms: number) => Promise<void>
}

const FILE_FIELDS = 'id,name,modifiedTime,size'
const REQUEST_TIMEOUT_MS = 30_000
/** Waits before each retry of a throttled or failed request. */
const RETRY_DELAYS_MS = [1_000, 3_000]

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

/** First `errors[].reason` from a Drive error body, if any. */
function errorReason(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as {
      error?: { errors?: Array<{ reason?: unknown }>; status?: unknown }
    }
    const reason = parsed.error?.errors?.[0]?.reason
    if (typeof reason === 'string') return reason
    return typeof parsed.error?.status === 'string' ? parsed.error.status : null
  } catch {
    return null
  }
}

/**
 * Drive's documented error responses, mapped to what sync can act on. Drive
 * reports a full account as 403 `storageQuotaExceeded`, and per-user or
 * per-project throttling as 403 `userRateLimitExceeded`/`rateLimitExceeded` or
 * 429.
 */
export function classifyDriveError(
  status: number,
  reason: string | null
): SyncTransportErrorCode {
  if (status === 401) return 'unauthorized'
  if (status === 404) return 'not-found'
  if (status === 429) return 'rate-limited'
  if (status === 403) {
    if (reason === 'storageQuotaExceeded') return 'storage-full'
    // `quotaExceeded` and `dailyLimitExceeded` are API usage limits, not the
    // user's storage.
    if (
      reason === 'userRateLimitExceeded' ||
      reason === 'rateLimitExceeded' ||
      reason === 'sharingRateLimitExceeded' ||
      reason === 'quotaExceeded' ||
      reason === 'dailyLimitExceeded'
    )
      return 'rate-limited'
    return 'unauthorized'
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

  /**
   * Runs `attempt` with a token, refreshing it once on 401 and backing off on
   * throttling and server errors.
   */
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
        const delay = RETRY_DELAYS_MS[retry]
        if (!retryable(code) || delay === undefined) {
          throw error instanceof SyncTransportError
            ? error
            : new SyncTransportError('network', String(error))
        }
        await sleep(delay + Math.floor(Math.random() * 250))
      }
    }
  }

  /**
   * One request, body included, within `REQUEST_TIMEOUT_MS`: React Native's
   * networking has no read timeout, so a half-open connection would otherwise
   * stall sync until the app restarts.
   */
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
    let status: number
    let body: string
    let headers: Headers
    try {
      const response = await fetchImpl(`${origin}${path}`, {
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
    const reason = errorReason(body)
    throw new SyncTransportError(
      classifyDriveError(status, reason),
      `Drive ${init.method} ${status}${reason ? ` ${reason}` : ''}`
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

  return {
    /** Every file in the app data folder, all pages. */
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

    /** Creates a JSON file in the app data folder in one request. */
    async createJson(name: string, json: string): Promise<DriveFile> {
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

    /** Idempotent: a file that's already gone counts as deleted. */
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

    /**
     * The Drive user's `permissionId`: stable for the Google Account and
     * unrelated to its email, so sync can notice an account switch without
     * storing who the user is.
     */
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

    /**
     * Uploads a local file as a JPEG with a resumable session, which creates
     * (or replaces) the file only once every byte arrived — a failed upload
     * never leaves a truncated photo behind.
     */
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
        if (result.status < 200 || result.status >= 300) {
          throw new SyncTransportError(
            classifyDriveError(result.status, errorReason(result.body)),
            `Drive upload ${result.status}`
          )
        }
        return driveFileFrom(JSON.parse(result.body))
      })
    },

    async downloadBinary(id: string, destinationPath: string): Promise<void> {
      await withRetries(async (token) => {
        let status: number
        try {
          ;({ status } = await options.transfer.download({
            url: `${origin}/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
            destinationPath,
            headers: { Authorization: `Bearer ${token}` },
          }))
        } catch (error) {
          throw new SyncTransportError(
            'network',
            `Drive download failed: ${String(error)}`
          )
        }
        if (status < 200 || status >= 300)
          throw new SyncTransportError(
            classifyDriveError(status, null),
            `Drive download ${status}`
          )
      })
    },
  }
}

export type DriveApi = ReturnType<typeof createDriveApi>
