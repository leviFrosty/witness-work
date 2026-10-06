import {
  DIAGNOSTIC_CONTENT_HASH,
  NotesImportAppAttestError,
  NotesImportAppAttestHttpError,
  canonicalProtectedRequest,
  throwIfAborted,
  waitForSignal,
  type NotesImportAppAttestEndpoint,
  type NotesImportAppAttestErrorCode,
  type NotesImportAuthDebugReport,
  type NotesImportAuthDebugStep,
  type NotesImportAuthRepairReport,
  type NotesImportProtectedPost,
} from '@/features/notes-import/lib/notesImportAppAttest'

/**
 * Android's Notes Import authorization (ADR 0017): Google Play Integrity
 * standard requests instead of App Attest.
 *
 * There is no device key, so there is nothing to register, journal, enroll, or
 * recover. Each protected request asks ww-api for a one-time challenge bound to
 * the request, then asks Play for a token whose `requestHash` is the SHA-256 of
 * the client data below. ww-api decodes that token with Google and checks the
 * binding, a Play-recognized app, and the device verdict.
 */

const PROVIDER = 'play-integrity'
const PROTOCOL = 'witnesswork.play-integrity'
const PROTOCOL_VERSION = 1 as const
/** Google's backoff for retryable token errors: 5 s, then 10 s. */
const TOKEN_RETRY_DELAYS_MS = [5_000, 10_000] as const

type PlayPurpose = 'notes-import-kickoff' | 'notes-import-verify'

/** Mirrors `modules/play-integrity`'s taxonomy without importing native code. */
export type PlayIntegrityNativeFailureCode =
  | 'unsupported'
  | 'invalidArgument'
  | 'apiNotAvailable'
  | 'playStoreNotFound'
  | 'network'
  | 'appNotInstalled'
  | 'playServicesNotFound'
  | 'appUidMismatch'
  | 'tooManyRequests'
  | 'cannotBindToService'
  | 'googleServerUnavailable'
  | 'playStoreOutdated'
  | 'playServicesOutdated'
  | 'cloudProjectNumberInvalid'
  | 'requestHashTooLong'
  | 'clientTransient'
  | 'providerInvalid'
  | 'internal'
  | 'unknown'

export interface NotesImportPlayIntegrityDependencies {
  playIntegrity: {
    isSupported(): boolean
    prepare(cloudProjectNumber: string): Promise<void>
    requestToken(
      cloudProjectNumber: string,
      requestHash: string
    ): Promise<string>
    classifyError(error: unknown): PlayIntegrityNativeFailureCode | null
  }
  identity: {
    getOrCreateUuid(): string
    getAccountId(): string
  }
  crypto: {
    sha256Hex(value: string): Promise<string>
    randomUuid(): string
  }
  transport: {
    getStatus(): Promise<unknown>
    post<T>(
      endpoint: NotesImportAppAttestEndpoint,
      body: Record<string, unknown>,
      options?: { headers?: Record<string, string>; signal?: AbortSignal }
    ): Promise<T>
  }
  devBypass: { enabled: boolean; token: string }
  baseUrl: string
  now(): number
  sleep(ms: number): Promise<void>
}

export interface NotesImportPlayIntegritySnapshot {
  provider: 'play-integrity'
  baseUrl: string
  devBypassEnabled: boolean
  playIntegritySupported: boolean
  negotiatedProtocolVersion: 1 | null
  installIdentity: 'present' | 'missing' | 'error'
  accountIdentity: 'local' | 'adopted' | 'missing' | 'error'
}

export interface NotesImportPlayIntegrity {
  post<T>(request: NotesImportProtectedPost): Promise<T>
  /** Nothing to recover without a device key; kept for interface parity. */
  prepareRecovery(): Promise<void>
  getSnapshot(): NotesImportPlayIntegritySnapshot
  /** The attested no-op verify through the full protected path. */
  runDiagnostics(): Promise<NotesImportAuthDebugReport>
  /** Same as diagnostics: there is no key to rotate. */
  runRepair(): Promise<NotesImportAuthRepairReport>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Byte-for-byte the client data ww-api rebuilds. MUST stay identical to
 * `buildPlayIntegrityClientData` in ww-api `src/playIntegrity/protocol.ts`.
 */
export const buildPlayIntegrityClientData = (input: {
  purpose: PlayPurpose
  operationId: string
  challenge: string
  uuid: string
  accountId: string
  contentHash: string
  requestHash: string
}): string =>
  [
    PROTOCOL,
    String(PROTOCOL_VERSION),
    'assert',
    input.purpose,
    input.operationId,
    input.challenge,
    input.uuid,
    input.accountId,
    input.contentHash,
    input.requestHash,
  ].join('|')

const cloudProjectFromStatus = (status: unknown): string => {
  const capabilities = isRecord(status) ? status.capabilities : undefined
  const play = isRecord(capabilities) ? capabilities.playIntegrity : undefined
  if (
    !isRecord(play) ||
    !Array.isArray(play.protocolVersions) ||
    !play.protocolVersions.includes(PROTOCOL_VERSION) ||
    typeof play.cloudProjectNumber !== 'string' ||
    !/^\d{1,20}$/.test(play.cloudProjectNumber)
  ) {
    throw new NotesImportAppAttestError('protocolUnavailable')
  }
  return play.cloudProjectNumber
}

const nativeFailureToErrorCode = (
  code: PlayIntegrityNativeFailureCode
): NotesImportAppAttestErrorCode => {
  switch (code) {
    case 'unsupported':
      return 'unsupported'
    case 'apiNotAvailable':
    case 'playStoreNotFound':
    case 'playServicesNotFound':
    case 'playStoreOutdated':
    case 'playServicesOutdated':
    case 'cannotBindToService':
      return 'playServicesUnavailable'
    // App cloners and virtual environments run the app under another UID.
    case 'appNotInstalled':
    case 'appUidMismatch':
      return 'deviceIneligible'
    case 'network':
      return 'network'
    case 'tooManyRequests':
    case 'googleServerUnavailable':
    case 'clientTransient':
    case 'internal':
    case 'providerInvalid':
      return 'serverUnavailable'
    case 'invalidArgument':
    case 'cloudProjectNumberInvalid':
    case 'requestHashTooLong':
      return 'invalidInput'
    case 'unknown':
      return 'nativeUnknown'
  }
}

const RETRYABLE_NATIVE_FAILURES = new Set<PlayIntegrityNativeFailureCode>([
  'network',
  'tooManyRequests',
  'googleServerUnavailable',
  'clientTransient',
  'internal',
])

/** Server reasons answered by retrying once under a fresh operation. */
const RESTART_REASONS = new Set([
  'challenge_not_found',
  'challenge_expired',
  'operation_conflict',
  'integrity_token_invalid',
])

const metadata = (error: NotesImportAppAttestHttpError) => ({
  status: error.status,
  serverCode: error.serverCode,
  reason: error.reason,
  action: error.action,
})

/**
 * Maps ww-api's Play Integrity reasons to the shared auth taxonomy. Returns
 * null for everything else (allowance denials, kill switch, caps) so those
 * reach the client as the server's own codes.
 */
const playHttpAuthError = (
  error: NotesImportAppAttestHttpError
): NotesImportAppAttestError | null => {
  if (error.kind === 'cancelled') {
    return new NotesImportAppAttestError('cancelled', metadata(error))
  }
  if (error.kind === 'network') {
    return new NotesImportAppAttestError('network', metadata(error))
  }
  switch (error.reason) {
    case 'device_integrity_failed':
    case 'app_not_recognized':
      return new NotesImportAppAttestError('deviceIneligible', metadata(error))
    case 'challenge_not_found':
    case 'challenge_expired':
      return new NotesImportAppAttestError('challengeExpired', metadata(error))
    case 'operation_conflict':
    case 'integrity_token_invalid':
      return new NotesImportAppAttestError(
        'authorizationFailed',
        metadata(error)
      )
    case 'integrity_unavailable':
    case 'storage_unavailable':
    case 'too_many_challenges':
      return new NotesImportAppAttestError('serverUnavailable', metadata(error))
    case 'invalid_request':
      return new NotesImportAppAttestError('invalidInput', metadata(error))
    case 'unsupported_protocol':
      return new NotesImportAppAttestError(
        'protocolUnavailable',
        metadata(error)
      )
    default:
      return null
  }
}

const restartRequested = (error: unknown): boolean =>
  error instanceof NotesImportAppAttestHttpError &&
  error.reason !== undefined &&
  RESTART_REASONS.has(error.reason)

const toAuthError = (error: unknown): Error => {
  if (error instanceof NotesImportAppAttestError) return error
  if (error instanceof NotesImportAppAttestHttpError) {
    return playHttpAuthError(error) ?? error
  }
  return new NotesImportAppAttestError('network')
}

export const createNotesImportPlayIntegrity = (
  dependencies: NotesImportPlayIntegrityDependencies
): NotesImportPlayIntegrity => {
  let capabilityPromise: Promise<string> | null = null
  let negotiatedProtocolVersion: 1 | null = null

  const supported = (): boolean => {
    try {
      return dependencies.playIntegrity.isSupported()
    } catch {
      return false
    }
  }

  /** The advertised Cloud project number; cached for the session on success. */
  const cloudProjectNumber = (): Promise<string> => {
    if (capabilityPromise) return capabilityPromise
    const pending = dependencies.transport
      .getStatus()
      .then(cloudProjectFromStatus)
      .then((value) => {
        negotiatedProtocolVersion = PROTOCOL_VERSION
        return value
      })
      .catch((error: unknown) => {
        if (error instanceof NotesImportAppAttestError) throw error
        throw new NotesImportAppAttestError('protocolUnavailable')
      })
    capabilityPromise = pending
    void pending.catch(() => {
      if (capabilityPromise === pending) capabilityPromise = null
    })
    return pending
  }

  const identity = (): { uuid: string; accountId: string } => {
    try {
      const uuid = dependencies.identity.getOrCreateUuid()
      const accountId = dependencies.identity.getAccountId()
      if (uuid && accountId) return { uuid, accountId }
    } catch {
      // Fall through to the shared storage failure.
    }
    throw new NotesImportAppAttestError('storageFailure')
  }

  const hashHex = async (value: string): Promise<string> => {
    try {
      const hash = await dependencies.crypto.sha256Hex(value)
      if (/^[a-f0-9]{64}$/.test(hash)) return hash
    } catch {
      // Fall through to the shared system failure.
    }
    throw new NotesImportAppAttestError('systemFailure')
  }

  const requestToken = async (
    project: string,
    binding: string,
    signal?: AbortSignal
  ): Promise<string> => {
    for (let attempt = 0; ; attempt += 1) {
      throwIfAborted(signal)
      try {
        return await dependencies.playIntegrity.requestToken(project, binding)
      } catch (error) {
        const code =
          dependencies.playIntegrity.classifyError(error) ?? 'unknown'
        const delay = TOKEN_RETRY_DELAYS_MS[attempt]
        if (!RETRYABLE_NATIVE_FAILURES.has(code) || delay === undefined) {
          throw new NotesImportAppAttestError(nativeFailureToErrorCode(code))
        }
        await waitForSignal(dependencies.sleep(delay), signal)
      }
    }
  }

  /** Optional per-step trace for the diagnostics report. */
  type Trace = (step: NotesImportAuthDebugStep) => void

  const traced = async <T>(
    trace: Trace | undefined,
    step: string,
    operation: () => Promise<T>
  ): Promise<T> => {
    const started = dependencies.now()
    try {
      const value = await operation()
      trace?.({ step, ok: true, ms: Math.max(0, dependencies.now() - started) })
      return value
    } catch (error) {
      const mapped = toAuthError(error)
      trace?.({
        step,
        ok: false,
        ms: Math.max(0, dependencies.now() - started),
        code:
          mapped instanceof NotesImportAppAttestError
            ? mapped.code
            : 'authorizationFailed',
      })
      throw error
    }
  }

  const protectedPost = async <T>(input: {
    endpoint: 'kickoff' | 'verify'
    purpose: PlayPurpose
    payload: Record<string, unknown>
    contentHash: string
    requestHash: string
    project: string
    signal?: AbortSignal
    trace?: Trace
    validate?: (data: unknown, operationId: string) => boolean
  }): Promise<T> => {
    const { uuid, accountId } = identity()
    let operationId = dependencies.crypto.randomUuid()
    // Warm the token provider while the challenge round-trips. Failures surface
    // from the token request itself, which prepares again when needed.
    void dependencies.playIntegrity.prepare(input.project).catch(() => {})

    for (let attempt = 0; ; attempt += 1) {
      throwIfAborted(input.signal)
      const fields = {
        attestationProvider: PROVIDER,
        protocolVersion: PROTOCOL_VERSION,
        operation: 'assert',
        operationId,
        uuid,
        accountId,
        purpose: input.purpose,
        contentHash: input.contentHash,
        requestHash: input.requestHash,
      }
      try {
        const challengeResponse = await traced(input.trace, 'challenge', () =>
          dependencies.transport.post<unknown>('challenge', fields, {
            signal: input.signal,
          })
        )
        if (
          !isRecord(challengeResponse) ||
          challengeResponse.attestationProvider !== PROVIDER ||
          challengeResponse.operationId !== operationId ||
          typeof challengeResponse.challenge !== 'string' ||
          !/^[A-Za-z0-9_-]{43}$/.test(challengeResponse.challenge)
        ) {
          throw new NotesImportAppAttestError('protocolUnavailable')
        }
        const challenge = challengeResponse.challenge
        const binding = await hashHex(
          buildPlayIntegrityClientData({
            purpose: input.purpose,
            operationId,
            challenge,
            uuid,
            accountId,
            contentHash: input.contentHash,
            requestHash: input.requestHash,
          })
        )
        const integrityToken = await traced(input.trace, 'token', () =>
          requestToken(input.project, binding, input.signal)
        )
        return await traced(input.trace, input.endpoint, async () => {
          const data = await dependencies.transport.post<T>(
            input.endpoint,
            { ...input.payload, ...fields, challenge, integrityToken },
            { signal: input.signal }
          )
          if (input.validate && !input.validate(data, operationId)) {
            throw new NotesImportAppAttestError('authorizationFailed')
          }
          return data
        })
      } catch (error) {
        if (attempt === 0 && restartRequested(error)) {
          operationId = dependencies.crypto.randomUuid()
          continue
        }
        throw toAuthError(error)
      }
    }
  }

  const devBypassPost = <T>(
    endpoint: 'kickoff' | 'verify',
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<T> => {
    const { uuid, accountId } = identity()
    return dependencies.transport.post<T>(
      endpoint,
      { ...body, uuid, accountId },
      { headers: { 'x-ww-dev-bypass': dependencies.devBypass.token }, signal }
    )
  }

  const isVerifyAcknowledgement = (data: unknown, operationId: string) =>
    isRecord(data) &&
    data.ok === true &&
    data.attestationProvider === PROVIDER &&
    data.protocolVersion === PROTOCOL_VERSION &&
    data.operationId === operationId

  const runVerify = async (): Promise<NotesImportAuthDebugReport> => {
    const operationId = dependencies.crypto.randomUuid()
    const report: NotesImportAuthDebugReport = {
      ok: false,
      protocolVersion: null,
      correlationId: operationId,
      steps: [],
    }
    const trace: Trace = (step) => report.steps.push(step)
    try {
      if (dependencies.devBypass.enabled) {
        // Mirrors the App Attest bypass probe: the server accepts the v2 shape.
        await traced(trace, 'verify', async () => {
          const data = await devBypassPost<unknown>('verify', {
            protocolVersion: 2,
            operation: 'assert',
            purpose: 'notes-import-verify',
            operationId,
            contentHash: DIAGNOSTIC_CONTENT_HASH,
            requestHash: DIAGNOSTIC_CONTENT_HASH,
          })
          if (!isRecord(data) || data.ok !== true) {
            throw new NotesImportAppAttestError('authorizationFailed')
          }
        })
        report.ok = true
        return report
      }
      await traced(trace, 'supported', async () => {
        if (!supported()) throw new NotesImportAppAttestError('unsupported')
      })
      const project = await traced(trace, 'capability', cloudProjectNumber)
      report.protocolVersion = PROTOCOL_VERSION
      await protectedPost<unknown>({
        endpoint: 'verify',
        purpose: 'notes-import-verify',
        payload: {},
        contentHash: DIAGNOSTIC_CONTENT_HASH,
        requestHash: DIAGNOSTIC_CONTENT_HASH,
        project,
        trace,
        validate: isVerifyAcknowledgement,
      })
      report.ok = true
    } catch (error) {
      // Traced steps record their own failures; keep untraced ones (identity,
      // hashing, a malformed challenge response) visible too.
      if (report.steps.every((step) => step.ok)) {
        const mapped = toAuthError(error)
        report.steps.push({
          step: 'protected-verify',
          ok: false,
          ms: 0,
          code:
            mapped instanceof NotesImportAppAttestError
              ? mapped.code
              : 'authorizationFailed',
        })
      }
    }
    return report
  }

  return {
    async post<T>({
      endpoint,
      payload,
      contentHash,
      signal,
    }: NotesImportProtectedPost): Promise<T> {
      throwIfAborted(signal)
      // Android only ever uses the streaming kickoff; ww-api refuses Play
      // Integrity on the legacy synchronous endpoint.
      if (endpoint !== 'kickoff') {
        throw new NotesImportAppAttestError('protocolUnavailable')
      }
      const requestHash = await hashHex(canonicalProtectedRequest(payload))
      if (dependencies.devBypass.enabled) {
        return devBypassPost<T>(
          'kickoff',
          {
            ...payload,
            protocolVersion: 2,
            operation: 'assert',
            purpose: 'notes-import-kickoff',
            operationId: dependencies.crypto.randomUuid(),
            requestHash,
            contentHash,
          },
          signal
        )
      }
      if (!supported()) throw new NotesImportAppAttestError('unsupported')
      const project = await waitForSignal(cloudProjectNumber(), signal)
      return protectedPost<T>({
        endpoint: 'kickoff',
        purpose: 'notes-import-kickoff',
        payload,
        contentHash,
        requestHash,
        project,
        signal,
      })
    },
    prepareRecovery: async () => {},
    getSnapshot(): NotesImportPlayIntegritySnapshot {
      let installIdentity: NotesImportPlayIntegritySnapshot['installIdentity'] =
        'missing'
      let accountIdentity: NotesImportPlayIntegritySnapshot['accountIdentity'] =
        'missing'
      try {
        const uuid = dependencies.identity.getOrCreateUuid()
        installIdentity = uuid ? 'present' : 'missing'
        try {
          accountIdentity =
            dependencies.identity.getAccountId() === uuid ? 'local' : 'adopted'
        } catch {
          accountIdentity = 'error'
        }
      } catch {
        installIdentity = 'error'
      }
      return {
        provider: 'play-integrity',
        baseUrl: dependencies.baseUrl,
        devBypassEnabled: dependencies.devBypass.enabled,
        playIntegritySupported: supported(),
        negotiatedProtocolVersion,
        installIdentity,
        accountIdentity,
      }
    },
    runDiagnostics: runVerify,
    runRepair: async () => ({ ...(await runVerify()), keyRotated: false }),
  }
}
