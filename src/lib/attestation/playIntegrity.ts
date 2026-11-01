import {
  ATTESTATION_VERIFY_PURPOSE,
  DIAGNOSTIC_CONTENT_HASH,
  AttestationError,
  AttestationHttpError,
  type AttestationPurpose,
  type AttestationSupport,
  type AttestedRequest,
  throwIfAborted,
  waitForSignal,
  type AttestationEndpoint,
  type AttestationErrorCode,
  type AttestationDebugReport,
  type AttestationDebugStep,
  type AttestationRepairReport,
} from '@/lib/attestation/appAttest'

const PROVIDER = 'play-integrity'
const PROTOCOL = 'witnesswork.play-integrity'
const PROTOCOL_VERSION = 1 as const

const TOKEN_RETRY_DELAYS_MS = [5_000, 10_000] as const
const TOKEN_RETRY_JITTER = 0.5

export const tokenRetryDelayMs = (
  attempt: number,
  random: () => number = Math.random
): number | undefined => {
  const base = TOKEN_RETRY_DELAYS_MS[attempt]
  if (base === undefined) return undefined
  return Math.round(base * (1 + TOKEN_RETRY_JITTER * random()))
}

type PlayPurpose = typeof ATTESTATION_VERIFY_PURPOSE | AttestationPurpose

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

export interface PlayIntegrityDependencies {
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
      endpoint: AttestationEndpoint,
      body: Record<string, unknown>,
      options?: { headers?: Record<string, string>; signal?: AbortSignal }
    ): Promise<T>
  }
  devBypass: { enabled: boolean; token: string }
  baseUrl: string
  now(): number
  sleep(ms: number): Promise<void>

  random?(): number
}

export interface PlayIntegritySnapshot {
  provider: 'play-integrity'
  baseUrl: string
  devBypassEnabled: boolean
  playIntegritySupported: boolean
  negotiatedProtocolVersion: 1 | null
  installIdentity: 'present' | 'missing' | 'error'
  accountIdentity: 'local' | 'adopted' | 'missing' | 'error'
}

export interface PlayIntegrityAuthorizer {
  assert<T>(request: AttestedRequest<T>): Promise<T>

  checkSupport(): Promise<AttestationSupport>

  prepareRecovery(): Promise<void>
  getSnapshot(): PlayIntegritySnapshot

  runDiagnostics(): Promise<AttestationDebugReport>

  runRepair(): Promise<AttestationRepairReport>
}

type ProtectedChannel<T> = {
  challenge: NonNullable<AttestedRequest<T>['challenge']>
  submit(body: Record<string, unknown>, signal?: AbortSignal): Promise<T>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const buildPlayIntegrityClientData = (input: {
  purpose: PlayPurpose
  operationId: string
  challenge: string
  uuid: string
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

    '',
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
    throw new AttestationError('protocolUnavailable')
  }
  return play.cloudProjectNumber
}

const nativeFailureToErrorCode = (
  code: PlayIntegrityNativeFailureCode
): AttestationErrorCode => {
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

const RESTART_REASONS = new Set([
  'challenge_not_found',
  'challenge_expired',
  'operation_conflict',
  'integrity_token_invalid',
])

const metadata = (error: AttestationHttpError) => ({
  status: error.status,
  serverCode: error.serverCode,
  reason: error.reason,
  action: error.action,
})

const playHttpAuthError = (
  error: AttestationHttpError
): AttestationError | null => {
  if (error.kind === 'cancelled') {
    return new AttestationError('cancelled', metadata(error))
  }
  if (error.kind === 'network') {
    return new AttestationError('network', metadata(error))
  }
  switch (error.reason) {
    case 'device_integrity_failed':
    case 'app_not_recognized':
      return new AttestationError('deviceIneligible', metadata(error))
    case 'challenge_not_found':
    case 'challenge_expired':
      return new AttestationError('challengeExpired', metadata(error))
    case 'operation_conflict':
    case 'integrity_token_invalid':
      return new AttestationError('authorizationFailed', metadata(error))
    case 'integrity_unavailable':
    case 'storage_unavailable':
    case 'too_many_challenges':
      return new AttestationError('serverUnavailable', metadata(error))
    case 'invalid_request':
      return new AttestationError('invalidInput', metadata(error))
    case 'unsupported_protocol':
      return new AttestationError('protocolUnavailable', metadata(error))
    default:
      return null
  }
}

const restartRequested = (error: unknown): boolean =>
  error instanceof AttestationHttpError &&
  error.reason !== undefined &&
  RESTART_REASONS.has(error.reason)

const toAuthError = (error: unknown): Error => {
  if (error instanceof AttestationError) return error
  if (error instanceof AttestationHttpError) {
    return playHttpAuthError(error) ?? error
  }
  return new AttestationError('network')
}

export const createPlayIntegrityAuthorizer = (
  dependencies: PlayIntegrityDependencies
): PlayIntegrityAuthorizer => {
  let capabilityPromise: Promise<string> | null = null
  let negotiatedProtocolVersion: 1 | null = null

  const supported = (): boolean => {
    try {
      return dependencies.playIntegrity.isSupported()
    } catch {
      return false
    }
  }

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
        if (error instanceof AttestationError) throw error

        if (error instanceof AttestationHttpError && error.kind !== 'http') {
          throw playHttpAuthError(error) ?? error
        }
        throw new AttestationError('protocolUnavailable')
      })
    capabilityPromise = pending
    void pending.catch(() => {
      if (capabilityPromise === pending) capabilityPromise = null
    })
    return pending
  }

  const installUuid = (): string => {
    try {
      const uuid = dependencies.identity.getOrCreateUuid()
      if (uuid) return uuid
    } catch {}
    throw new AttestationError('storageFailure')
  }

  const hashHex = async (value: string): Promise<string> => {
    try {
      const hash = await dependencies.crypto.sha256Hex(value)
      if (/^[a-f0-9]{64}$/.test(hash)) return hash
    } catch {}
    throw new AttestationError('systemFailure')
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
        const delay = tokenRetryDelayMs(
          attempt,
          dependencies.random ?? Math.random
        )
        if (!RETRYABLE_NATIVE_FAILURES.has(code) || delay === undefined) {
          throw new AttestationError(nativeFailureToErrorCode(code))
        }
        await waitForSignal(dependencies.sleep(delay), signal)
      }
    }
  }

  type Trace = (step: AttestationDebugStep) => void

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
          mapped instanceof AttestationError
            ? mapped.code
            : 'authorizationFailed',
      })
      throw error
    }
  }

  const protectedPost = async <T>(input: {
    channel: ProtectedChannel<T>
    purpose: PlayPurpose
    contentHash: string
    requestHash: string
    project: string
    signal?: AbortSignal
    trace?: Trace

    submitStep?: string
    validate?: (data: unknown, operationId: string) => boolean
  }): Promise<T> => {
    const uuid = installUuid()
    let operationId = dependencies.crypto.randomUuid()

    void dependencies.playIntegrity.prepare(input.project).catch(() => {})

    for (let attempt = 0; ; attempt += 1) {
      throwIfAborted(input.signal)
      const fields = {
        attestationProvider: PROVIDER,
        protocolVersion: PROTOCOL_VERSION,
        operation: 'assert',
        operationId,
        uuid,
        purpose: input.purpose,
        contentHash: input.contentHash,
        requestHash: input.requestHash,
      }
      try {
        const challengeResponse = await traced(input.trace, 'challenge', () =>
          input.channel.challenge(fields, input.signal)
        )
        if (
          !isRecord(challengeResponse) ||
          challengeResponse.attestationProvider !== PROVIDER ||
          challengeResponse.operationId !== operationId ||
          typeof challengeResponse.challenge !== 'string' ||
          !/^[A-Za-z0-9_-]{43}$/.test(challengeResponse.challenge)
        ) {
          throw new AttestationError('protocolUnavailable')
        }
        const challenge = challengeResponse.challenge
        const binding = await hashHex(
          buildPlayIntegrityClientData({
            purpose: input.purpose,
            operationId,
            challenge,
            uuid,
            contentHash: input.contentHash,
            requestHash: input.requestHash,
          })
        )
        const integrityToken = await traced(input.trace, 'token', () =>
          requestToken(input.project, binding, input.signal)
        )
        const step = input.submitStep ?? input.purpose
        return await traced(input.trace, step, async () => {
          const body = { ...fields, challenge, integrityToken }
          const data = await input.channel.submit(body, input.signal)
          if (input.validate && !input.validate(data, operationId)) {
            throw new AttestationError('authorizationFailed')
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

  const postChallenge = (
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> =>
    dependencies.transport.post<unknown>('challenge', body, { signal })

  const isVerifyAcknowledgement = (data: unknown, operationId: string) =>
    isRecord(data) &&
    data.ok === true &&
    data.attestationProvider === PROVIDER &&
    data.protocolVersion === PROTOCOL_VERSION &&
    data.operationId === operationId

  const runVerify = async (): Promise<AttestationDebugReport> => {
    const operationId = dependencies.crypto.randomUuid()
    const report: AttestationDebugReport = {
      ok: false,
      protocolVersion: null,
      correlationId: operationId,
      steps: [],
    }
    const trace: Trace = (step) => report.steps.push(step)
    try {
      if (dependencies.devBypass.enabled) {
        await traced(trace, 'verify', async () => {
          const data = await dependencies.transport.post<unknown>(
            'verify',
            {
              protocolVersion: 2,
              operation: 'assert',
              purpose: ATTESTATION_VERIFY_PURPOSE,
              operationId,
              contentHash: DIAGNOSTIC_CONTENT_HASH,
              requestHash: DIAGNOSTIC_CONTENT_HASH,
              uuid: installUuid(),
            },
            { headers: { 'x-ww-dev-bypass': dependencies.devBypass.token } }
          )
          if (!isRecord(data) || data.ok !== true) {
            throw new AttestationError('authorizationFailed')
          }
        })
        report.ok = true
        return report
      }
      await traced(trace, 'supported', async () => {
        if (!supported()) throw new AttestationError('unsupported')
      })
      const project = await traced(trace, 'capability', cloudProjectNumber)
      report.protocolVersion = PROTOCOL_VERSION
      await protectedPost<unknown>({
        channel: {
          challenge: postChallenge,
          submit: (body, signal) =>
            dependencies.transport.post<unknown>('verify', body, { signal }),
        },
        purpose: ATTESTATION_VERIFY_PURPOSE,
        contentHash: DIAGNOSTIC_CONTENT_HASH,
        requestHash: DIAGNOSTIC_CONTENT_HASH,
        project,
        trace,
        submitStep: 'verify',
        validate: isVerifyAcknowledgement,
      })
      report.ok = true
    } catch (error) {
      if (report.steps.every((step) => step.ok)) {
        const mapped = toAuthError(error)
        report.steps.push({
          step: 'protected-verify',
          ok: false,
          ms: 0,
          code:
            mapped instanceof AttestationError
              ? mapped.code
              : 'authorizationFailed',
        })
      }
    }
    return report
  }

  return {
    async assert<T>(request: AttestedRequest<T>): Promise<T> {
      const { purpose, contentHash, requestHash, signal } = request
      throwIfAborted(signal)
      if (
        !/^[a-f0-9]{64}$/.test(contentHash) ||
        !/^[a-f0-9]{64}$/.test(requestHash)
      ) {
        throw new AttestationError('invalidInput')
      }
      if (dependencies.devBypass.enabled) {
        return request.submit(
          { kind: 'devBypass', token: dependencies.devBypass.token },
          signal
        )
      }
      if (!supported()) throw new AttestationError('unsupported')
      const project = await waitForSignal(cloudProjectNumber(), signal)
      return protectedPost<T>({
        channel: {
          challenge: request.challenge ?? postChallenge,
          submit: (fields, attemptSignal) =>
            request.submit({ kind: 'attestation', fields }, attemptSignal),
        },
        purpose,
        contentHash,
        requestHash,
        project,
        signal,
      })
    },
    async checkSupport(): Promise<AttestationSupport> {
      if (dependencies.devBypass.enabled) return 'supported'
      if (!supported()) return 'unsupported'
      let project: string
      try {
        project = await cloudProjectNumber()
      } catch {
        return 'unknown'
      }
      try {
        await dependencies.playIntegrity.prepare(project)
        return 'supported'
      } catch (error) {
        const code = nativeFailureToErrorCode(
          dependencies.playIntegrity.classifyError(error) ?? 'unknown'
        )
        return code === 'unsupported' ||
          code === 'playServicesUnavailable' ||
          code === 'deviceIneligible'
          ? 'unsupported'
          : 'unknown'
      }
    },
    prepareRecovery: async () => {},
    getSnapshot(): PlayIntegritySnapshot {
      let installIdentity: PlayIntegritySnapshot['installIdentity'] = 'missing'
      let accountIdentity: PlayIntegritySnapshot['accountIdentity'] = 'missing'
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
