import axios, { isAxiosError, isCancel } from 'axios'
import apis from '@/constants/apis'
import {
  NotesImportAppAttestHttpError,
  type NotesImportAppAttestEndpoint,
} from '@/features/notes-import/lib/notesImportAppAttest'

/**
 * HTTP transport shared by both Notes Import authorizers (App Attest on iOS,
 * Play Integrity on Android). Failures become sanitized
 * {@link NotesImportAppAttestHttpError}s carrying only stable metadata.
 */

const REQUEST_TIMEOUT_MS = 90_000
const DEV_BYPASS_TOKEN = process.env.EXPO_PUBLIC_API_DEV_BYPASS || ''

export const notesImportDevBypass = {
  enabled:
    typeof __DEV__ !== 'undefined' && __DEV__ && DEV_BYPASS_TOKEN.length > 0,
  token: DEV_BYPASS_TOKEN,
}

export const notesImportBaseUrl = apis.notesImport.replace(
  /\/notes-import$/,
  ''
)

const endpointUrl = (endpoint: NotesImportAppAttestEndpoint): string => {
  switch (endpoint) {
    case 'challenge':
      return apis.notesImportChallenge
    case 'registration':
      return apis.notesImportAttest
    case 'kickoff':
      return apis.notesImportKickoff
    case 'legacy':
      return apis.notesImport
    case 'verify':
      return apis.notesImportVerify
  }
}

const toHttpError = (error: unknown): NotesImportAppAttestHttpError => {
  if (error instanceof NotesImportAppAttestHttpError) return error
  if (
    isCancel(error) ||
    (isAxiosError(error) && error.code === 'ERR_CANCELED') ||
    (error instanceof Error && error.name === 'AbortError')
  ) {
    return new NotesImportAppAttestHttpError({ kind: 'cancelled' })
  }
  if (!isAxiosError(error)) {
    return new NotesImportAppAttestHttpError({ kind: 'network' })
  }
  const payload =
    typeof error.response?.data === 'object' &&
    error.response.data !== null &&
    !Array.isArray(error.response.data)
      ? (error.response.data as Record<string, unknown>)
      : null
  return new NotesImportAppAttestHttpError({
    kind: error.response ? 'http' : 'network',
    status: error.response?.status,
    serverCode: typeof payload?.code === 'string' ? payload.code : undefined,
    reason: typeof payload?.reason === 'string' ? payload.reason : undefined,
    action: typeof payload?.action === 'string' ? payload.action : undefined,
    credits: payload?.credits,
  })
}

export const notesImportTransport = {
  getStatus: async (): Promise<unknown> => {
    try {
      const { data } = await axios.get<unknown>(apis.notesImportStatus, {
        timeout: 8_000,
      })
      return data
    } catch (error) {
      throw toHttpError(error)
    }
  },
  post: async <T>(
    endpoint: NotesImportAppAttestEndpoint,
    body: Record<string, unknown>,
    options?: { headers?: Record<string, string>; signal?: AbortSignal }
  ): Promise<T> => {
    try {
      const { data } = await axios.post<T>(endpointUrl(endpoint), body, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: options?.headers,
        signal: options?.signal,
      })
      return data
    } catch (error) {
      throw toHttpError(error)
    }
  },
}
