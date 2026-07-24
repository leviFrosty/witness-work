export type NotesImportAppAttestEndpoint =
  | 'challenge'
  | 'registration'
  | 'kickoff'
  | 'legacy'
  | 'verify'

export type NotesImportProtectedEndpoint = 'kickoff' | 'legacy'

export type AppAttestNativeFailureCode =
  | 'unsupported'
  | 'invalidInput'
  | 'invalidKey'
  | 'serverUnavailable'
  | 'systemFailure'
  | 'unknown'

export type NotesImportAppAttestErrorCode =
  | 'unsupported'
  | 'invalidInput'
  | 'invalidKey'
  | 'serverUnavailable'
  | 'systemFailure'
  | 'nativeUnknown'
  | 'storageFailure'
  | 'protocolUnavailable'
  | 'recoveryUnavailable'
  | 'challengeExpired'
  | 'counterConflict'
  | 'keyInactive'
  | 'authorizationFailed'
  | 'network'
  | 'cancelled'
  | 'invalidState'

interface NotesImportAppAttestSemanticMetadata {
  status?: number
  serverCode?: string
  reason?: string
  action?: string
}

export class NotesImportAppAttestError extends Error {
  readonly code: NotesImportAppAttestErrorCode
  readonly status?: number
  readonly serverCode?: string
  readonly reason?: string
  readonly action?: string

  constructor(
    code: NotesImportAppAttestErrorCode,
    options: NotesImportAppAttestSemanticMetadata = {}
  ) {
    super(`Notes Import authorization failed (${code})`)
    this.name = 'NotesImportAppAttestError'
    this.code = code
    this.status = options.status
    this.serverCode = options.serverCode
    this.reason = options.reason
    this.action = options.action
  }
}

export interface NotesImportAppAttestHttpErrorOptions {
  kind: 'network' | 'http' | 'cancelled'
  status?: number
  serverCode?: string
  reason?: string
  action?: string
  credits?: unknown
}

/**
 * Sanitized transport failure. It deliberately carries no request body, raw
 * response, challenge, attestation, assertion, or server-localized message.
 */
export class NotesImportAppAttestHttpError extends Error {
  readonly kind: 'network' | 'http' | 'cancelled'
  readonly status?: number
  readonly serverCode?: string
  readonly reason?: string
  readonly action?: string
  readonly credits?: unknown

  constructor(options: NotesImportAppAttestHttpErrorOptions) {
    super(
      options.kind === 'cancelled'
        ? 'Notes Import request cancelled'
        : options.kind === 'network'
          ? 'Notes Import network request failed'
          : 'Notes Import HTTP request failed'
    )
    this.name = 'NotesImportAppAttestHttpError'
    this.kind = options.kind
    this.status = options.status
    this.serverCode = options.serverCode
    this.reason = options.reason
    this.action = options.action
    this.credits = options.credits
  }
}

export interface NotesImportAppAttestDependencies {
  appAttest: {
    isSupported(): boolean
    generateKey(): Promise<string>
    attestKey(keyId: string, clientDataHashBase64: string): Promise<string>
    generateAssertion(
      keyId: string,
      clientDataHashBase64: string
    ): Promise<string>
    classifyError(error: unknown): AppAttestNativeFailureCode | null
  }
  secureStore: {
    /** False for OTA JS running against the original UUID-only native module. */
    supportsRecoveryStorage?(): boolean
    readActiveKeyId(): string | null
    writeActiveKeyId(keyId: string): void
    readRecoveryToken(): string | null
    getOrCreateRecoveryToken(): string
    /** Opaque key-id + token-hash marker acknowledged by the server. */
    readRecoveryEnrollmentKeyId(): string | null
    writeRecoveryEnrollmentKeyId(marker: string): void
  }
  persistence: {
    readJournal(): string | null
    writeJournal(journal: string): void
    clearJournal(): void
    readLegacyKeyId(): string | null
    mirrorLegacyKeyId(keyId: string): void
  }
  identity: {
    peekUuid(): string | null
    getOrCreateUuid(): string
    getAccountId(): string
  }
  crypto: {
    sha256Base64(value: string): Promise<string>
    sha256Hex(value: string): Promise<string>
    recoveryTokenHash(token: string): Promise<string>
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
}

export interface NotesImportProtectedPost {
  endpoint: NotesImportProtectedEndpoint
  payload: Record<string, unknown>
  contentHash: string
  signal?: AbortSignal
}

export interface NotesImportAuthSnapshot {
  baseUrl: string
  devBypassEnabled: boolean
  appAttestSupported: boolean
  negotiatedProtocolVersion: 1 | 2 | null
  installIdentity: 'present' | 'missing' | 'error'
  accountIdentity: 'local' | 'adopted' | 'missing' | 'error'
  activeKey: 'keychain' | 'legacyMigrationPending' | 'missing' | 'error'
  recoveryToken: 'present' | 'missing' | 'error'
  pendingOperation: null | {
    kind: 'bootstrap' | 'bind' | 'recovery' | 'enrollment' | 'invalid'
    stage: string
    correlationId?: string
  }
}

export interface NotesImportAuthDebugStep {
  step: string
  ok: boolean
  ms: number
  code?: NotesImportAppAttestErrorCode
}

export interface NotesImportAuthDebugReport {
  ok: boolean
  protocolVersion: 1 | 2 | null
  correlationId: string
  steps: NotesImportAuthDebugStep[]
}

export interface NotesImportAppAttest {
  post<T>(request: NotesImportProtectedPost): Promise<T>
  /** Enrolls recovery for an existing key; never creates a first-use key. */
  prepareRecovery(): Promise<void>
  /** Redacted, lifecycle-read-only state for developer diagnostics. */
  getSnapshot(): NotesImportAuthSnapshot
  /** Uses an existing key only; never binds, enrolls, recovers, or promotes. */
  runDiagnostics(): Promise<NotesImportAuthDebugReport>
}

const APP_ATTEST_PROTOCOL = 'witnesswork.app-attest'
const JOURNAL_VERSION = 2 as const
const JOURNAL_MAX_AGE_MS = 24 * 60 * 60 * 1000
const JOURNAL_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
const DIAGNOSTIC_CONTENT_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

const RECOVERY_SERVER_REASONS = new Set([
  'identity_not_bound',
  'key_not_active',
])
const CHALLENGE_SERVER_REASONS = new Set([
  'challenge_not_found',
  'challenge_expired',
])
const COUNTER_SERVER_REASONS = new Set(['counter_not_increasing'])
const RECOVERY_UNAVAILABLE_REASONS = new Set([
  'recovery_not_enrolled',
  'recovery_token_mismatch',
])
const START_NEW_OPERATION_REASONS = new Set([
  'operation_conflict',
  'challenge_not_found',
  'challenge_expired',
  'counter_not_increasing',
])

const cancellationError = (): NotesImportAppAttestError =>
  new NotesImportAppAttestError('cancelled')

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw cancellationError()
}

/**
 * Lets one caller stop waiting for shared work without cancelling that work for
 * every other caller using the same cached promise.
 */
const waitForSignal = <T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> => {
  if (!signal) return promise
  throwIfAborted(signal)
  return new Promise<T>((resolve, reject) => {
    const aborted = (): void => {
      signal.removeEventListener('abort', aborted)
      reject(cancellationError())
    }
    signal.addEventListener('abort', aborted, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', aborted)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', aborted)
        reject(error)
      }
    )
  })
}

class FifoLane {
  private readonly tails = new Map<string, Promise<void>>()

  run<T>(
    key: string,
    operation: () => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    const invoke = (): Promise<T> => {
      throwIfAborted(signal)
      return operation()
    }
    const result = previous.then(invoke, invoke)
    const tail = result.then(
      () => undefined,
      () => undefined
    )
    this.tails.set(key, tail)
    void tail.finally(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    })
    return result
  }
}

type ProtocolVersion = 1 | 2
type ChallengeOperation = 'bind' | 'enroll' | 'assert'
type ProtectedPurpose = 'notes-import-kickoff' | 'notes-import-verify'

type BootstrapJournal = {
  v: typeof JOURNAL_VERSION
  kind: 'bootstrap'
  protocolVersion: ProtocolVersion
  mode: 'initial' | 'recovery'
  operationId: string
  uuid: string
  operationRestartCount: 0 | 1
  recoveryTokenHash?: string
  /** Written before generateKey; true on restart means its result is unknown. */
  generationInFlight: boolean
  updatedAt?: number
}

type CandidateJournal = {
  v: typeof JOURNAL_VERSION
  kind: 'candidate'
  protocolVersion: ProtocolVersion
  mode: 'initial' | 'recovery'
  operationId: string
  uuid: string
  keyId: string
  operationRestartCount: 0 | 1
  recoveryTokenHash?: string
  challenge?: string
  clientData?: string
  clientDataHash?: string
  attestation?: string
  /** Written before the one-shot Apple call; true on restart is ambiguous. */
  attestationInFlight?: boolean
  /** An observed Apple serverUnavailable permits retrying the exact tuple. */
  attestationRetryable?: boolean
  updatedAt?: number
}

type EnrollmentJournal = {
  v: typeof JOURNAL_VERSION
  kind: 'enrollment'
  protocolVersion: 2
  operationId: string
  uuid: string
  keyId: string
  operationRestartCount: 0 | 1
  recoveryTokenHash?: string
  challenge?: string
  clientData?: string
  clientDataHash?: string
  assertion?: string
  updatedAt?: number
}

type LifecycleJournal = BootstrapJournal | CandidateJournal | EnrollmentJournal

type ProtectedAttempt<T> =
  | { kind: 'success'; data: T }
  | { kind: 'retryWithCurrentKey'; keyId: string }
  | { kind: 'retryWithFreshOperation' }
  | { kind: 'recover' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const isProtocolVersion = (value: unknown): value is ProtocolVersion =>
  value === 1 || value === 2

const optionalStringIsValid = (value: unknown): value is string | undefined =>
  value === undefined || isNonEmptyString(value)

const operationRestartCount = (value: unknown): 0 | 1 | null => {
  if (value === undefined || value === 0) return 0
  return value === 1 ? 1 : null
}

/**
 * JSON.stringify semantics with recursively sorted object keys. This must stay
 * byte-for-byte identical to ww-api's request canonicalizer.
 */
const stableCanonicalJson = (value: unknown): string => {
  try {
    const serialized = JSON.stringify(value, (_key, nested: unknown) => {
      if (
        nested == null ||
        typeof nested !== 'object' ||
        Array.isArray(nested)
      ) {
        return nested
      }
      const record = nested as Record<string, unknown>
      const ordered: Record<string, unknown> = Object.create(null) as Record<
        string,
        unknown
      >
      for (const key of Object.keys(record).sort()) ordered[key] = record[key]
      return ordered
    })
    if (serialized === undefined) {
      throw new NotesImportAppAttestError('invalidInput')
    }
    return serialized
  } catch (error) {
    if (error instanceof NotesImportAppAttestError) throw error
    throw new NotesImportAppAttestError('invalidInput')
  }
}

const canonicalProtectedRequest = (
  payload: Record<string, unknown>
): string => {
  if (typeof payload.notesText !== 'string' || !isRecord(payload.context)) {
    throw new NotesImportAppAttestError('invalidInput')
  }
  return stableCanonicalJson({
    notesText: payload.notesText,
    context: payload.context,
    refinement: payload.refinement ?? null,
  })
}

const parseJournal = (raw: string): LifecycleJournal => {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new NotesImportAppAttestError('invalidState')
  }
  if (
    !isRecord(value) ||
    value.v !== JOURNAL_VERSION ||
    !isProtocolVersion(value.protocolVersion) ||
    !isNonEmptyString(value.operationId) ||
    !isNonEmptyString(value.uuid) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt < 0
  ) {
    throw new NotesImportAppAttestError('invalidState')
  }

  const restartCount = operationRestartCount(value.operationRestartCount)
  if (
    value.kind === 'bootstrap' &&
    restartCount !== null &&
    (value.mode === undefined ||
      value.mode === 'initial' ||
      value.mode === 'recovery') &&
    optionalStringIsValid(value.recoveryTokenHash) &&
    (value.generationInFlight === undefined ||
      typeof value.generationInFlight === 'boolean') &&
    (value.mode !== 'recovery' || value.protocolVersion === 2)
  ) {
    return {
      v: JOURNAL_VERSION,
      kind: 'bootstrap',
      protocolVersion: value.protocolVersion,
      mode: value.mode === 'recovery' ? 'recovery' : 'initial',
      operationId: value.operationId,
      uuid: value.uuid,
      operationRestartCount: restartCount,
      recoveryTokenHash: value.recoveryTokenHash,
      generationInFlight: value.generationInFlight ?? false,
      updatedAt: value.updatedAt,
    }
  }

  if (
    value.kind === 'candidate' &&
    restartCount !== null &&
    (value.mode === 'initial' || value.mode === 'recovery') &&
    isNonEmptyString(value.keyId) &&
    optionalStringIsValid(value.recoveryTokenHash) &&
    optionalStringIsValid(value.challenge) &&
    optionalStringIsValid(value.clientData) &&
    optionalStringIsValid(value.clientDataHash) &&
    optionalStringIsValid(value.attestation) &&
    (value.attestationInFlight === undefined ||
      typeof value.attestationInFlight === 'boolean') &&
    (value.attestationRetryable === undefined ||
      typeof value.attestationRetryable === 'boolean') &&
    (value.mode !== 'recovery' || value.protocolVersion === 2) &&
    (value.protocolVersion !== 2 ||
      isNonEmptyString(value.recoveryTokenHash)) &&
    ((value.challenge === undefined &&
      value.clientData === undefined &&
      value.clientDataHash === undefined &&
      value.attestation === undefined) ||
      (isNonEmptyString(value.challenge) &&
        isNonEmptyString(value.clientData) &&
        isNonEmptyString(value.clientDataHash) &&
        (value.attestation === undefined ||
          isNonEmptyString(value.attestation))))
  ) {
    return {
      v: JOURNAL_VERSION,
      kind: 'candidate',
      protocolVersion: value.protocolVersion,
      mode: value.mode,
      operationId: value.operationId,
      uuid: value.uuid,
      keyId: value.keyId,
      operationRestartCount: restartCount,
      recoveryTokenHash: value.recoveryTokenHash,
      challenge: value.challenge,
      clientData: value.clientData,
      clientDataHash: value.clientDataHash,
      attestation: value.attestation,
      attestationInFlight: value.attestationInFlight,
      attestationRetryable: value.attestationRetryable,
      updatedAt: value.updatedAt,
    }
  }

  if (
    value.kind === 'enrollment' &&
    restartCount !== null &&
    value.protocolVersion === 2 &&
    isNonEmptyString(value.keyId) &&
    optionalStringIsValid(value.recoveryTokenHash) &&
    optionalStringIsValid(value.challenge) &&
    optionalStringIsValid(value.clientData) &&
    optionalStringIsValid(value.clientDataHash) &&
    optionalStringIsValid(value.assertion) &&
    ((value.challenge === undefined &&
      value.clientData === undefined &&
      value.clientDataHash === undefined &&
      value.assertion === undefined) ||
      (isNonEmptyString(value.recoveryTokenHash) &&
        isNonEmptyString(value.challenge) &&
        isNonEmptyString(value.clientData) &&
        isNonEmptyString(value.clientDataHash) &&
        (value.assertion === undefined || isNonEmptyString(value.assertion))))
  ) {
    return {
      v: JOURNAL_VERSION,
      kind: 'enrollment',
      protocolVersion: 2,
      operationId: value.operationId,
      uuid: value.uuid,
      keyId: value.keyId,
      operationRestartCount: restartCount,
      recoveryTokenHash: value.recoveryTokenHash,
      challenge: value.challenge,
      clientData: value.clientData,
      clientDataHash: value.clientDataHash,
      assertion: value.assertion,
      updatedAt: value.updatedAt,
    }
  }

  throw new NotesImportAppAttestError('invalidState')
}

const protocolVersionFromStatus = (status: unknown): ProtocolVersion => {
  // Additive capability contract. A deployed status response with no capability
  // is v1; only an explicit advertised 2 opts this client into recovery/binding.
  if (!isRecord(status)) return 1
  const capabilities = status.capabilities
  if (!isRecord(capabilities)) return 1
  const appAttest = capabilities.appAttest
  if (!isRecord(appAttest)) return 1
  const versions = appAttest.protocolVersions
  if (!Array.isArray(versions)) {
    throw new NotesImportAppAttestError('protocolUnavailable')
  }
  if (versions.includes(2)) return 2
  if (versions.includes(1)) return 1
  throw new NotesImportAppAttestError('protocolUnavailable')
}

const purposeForEndpoint = (
  _endpoint: NotesImportProtectedEndpoint
): ProtectedPurpose => 'notes-import-kickoff'

const buildBindClientData = (input: {
  operationId: string
  challenge: string
  uuid: string
  recoveryTokenHash: string
}): string =>
  [
    APP_ATTEST_PROTOCOL,
    '2',
    'bind',
    input.operationId,
    input.challenge,
    input.uuid,
    input.recoveryTokenHash,
  ].join('|')

const buildEnrollClientData = (input: {
  operationId: string
  challenge: string
  uuid: string
  keyId: string
  recoveryTokenHash: string
}): string =>
  [
    APP_ATTEST_PROTOCOL,
    '2',
    'enroll',
    input.operationId,
    input.challenge,
    input.uuid,
    input.keyId,
    input.recoveryTokenHash,
  ].join('|')

const buildAssertionClientData = (input: {
  purpose: ProtectedPurpose
  operationId: string
  challenge: string
  uuid: string
  accountId: string
  contentHash: string
  requestHash: string
}): string =>
  [
    APP_ATTEST_PROTOCOL,
    '2',
    'assert',
    input.purpose,
    input.operationId,
    input.challenge,
    input.uuid,
    input.accountId,
    input.contentHash,
    input.requestHash,
  ].join('|')

const nativeFailureToErrorCode = (
  code: AppAttestNativeFailureCode
): NotesImportAppAttestErrorCode => {
  switch (code) {
    case 'unsupported':
    case 'invalidInput':
    case 'invalidKey':
    case 'serverUnavailable':
    case 'systemFailure':
      return code
    case 'unknown':
      return 'nativeUnknown'
  }
}

const httpAuthError = (
  error: NotesImportAppAttestHttpError
): NotesImportAppAttestError | null => {
  const options: NotesImportAppAttestSemanticMetadata = {
    status: error.status,
    serverCode: error.serverCode,
    reason: error.reason,
    action: error.action,
  }
  if (error.kind === 'cancelled') {
    return new NotesImportAppAttestError('cancelled', options)
  }
  if (error.kind === 'network') {
    return new NotesImportAppAttestError('network', options)
  }
  if (
    (error.reason && CHALLENGE_SERVER_REASONS.has(error.reason)) ||
    error.serverCode === 'challenge_expired'
  ) {
    return new NotesImportAppAttestError('challengeExpired', options)
  }
  if (
    (error.reason && COUNTER_SERVER_REASONS.has(error.reason)) ||
    error.serverCode === 'counter_conflict'
  ) {
    return new NotesImportAppAttestError('counterConflict', options)
  }
  if (
    (error.reason && RECOVERY_SERVER_REASONS.has(error.reason)) ||
    error.serverCode === 'key_inactive' ||
    error.serverCode === 'recovery_required'
  ) {
    return new NotesImportAppAttestError('keyInactive', options)
  }
  if (error.reason && RECOVERY_UNAVAILABLE_REASONS.has(error.reason)) {
    return new NotesImportAppAttestError('recoveryUnavailable', options)
  }
  if (
    error.reason === 'storage_unavailable' ||
    error.reason === 'too_many_challenges'
  ) {
    return new NotesImportAppAttestError('serverUnavailable', options)
  }
  if (error.reason === 'unsupported_protocol') {
    return new NotesImportAppAttestError('protocolUnavailable', options)
  }
  if (error.reason === 'invalid_request') {
    return new NotesImportAppAttestError('invalidInput', options)
  }
  if (error.reason === 'operation_conflict') {
    return new NotesImportAppAttestError('authorizationFailed', options)
  }
  if (error.status === 401 || error.status === 403) {
    return new NotesImportAppAttestError('authorizationFailed', options)
  }
  return null
}

const semanticMetadata = (
  error: NotesImportAppAttestHttpError
): NotesImportAppAttestSemanticMetadata => ({
  status: error.status,
  serverCode: error.serverCode,
  reason: error.reason,
  action: error.action,
})

const startNewOperationRequested = (error: unknown): boolean => {
  if (
    !(error instanceof NotesImportAppAttestHttpError) &&
    !(error instanceof NotesImportAppAttestError)
  ) {
    return false
  }
  return (
    error.action === 'start_new_operation' ||
    (error.reason !== undefined &&
      START_NEW_OPERATION_REASONS.has(error.reason))
  )
}

const isRetryableLifecycleHttpError = (
  error: NotesImportAppAttestHttpError
): boolean =>
  error.kind === 'network' ||
  (error.status !== undefined && error.status >= 500 && error.status <= 599)

const isV1Acknowledgement = (value: unknown): boolean =>
  isRecord(value) && value.ok === true

const isV2RegistrationAcknowledgement = (
  value: unknown,
  operation: 'bind' | 'enroll',
  operationId: string
): boolean => {
  if (
    !isRecord(value) ||
    value.ok !== true ||
    value.protocolVersion !== 2 ||
    value.operationId !== operationId ||
    value.recoveryEnrolled !== true
  ) {
    return false
  }
  return operation === 'enroll'
    ? value.status === 'recovery_enrolled'
    : value.status === 'bound' ||
        value.status === 'already_bound' ||
        value.status === 'rotated'
}

const isAssertionAcknowledgement = (
  value: unknown,
  protocol: ProtocolVersion,
  operationId: string
): boolean =>
  protocol === 1
    ? isV1Acknowledgement(value)
    : isRecord(value) &&
      value.ok === true &&
      value.protocolVersion === 2 &&
      value.operationId === operationId

const pendingStage = (journal: LifecycleJournal): string => {
  if (journal.kind === 'bootstrap') {
    if (journal.generationInFlight) return 'key-generation-in-flight'
    if (journal.recoveryTokenHash) return 'token-journaled'
    return 'identity-created'
  }
  if (journal.kind === 'candidate') {
    if (journal.attestation) return 'attested'
    if (journal.attestationInFlight) return 'attestation-in-flight'
    if (journal.attestationRetryable) return 'attestation-retryable'
    if (journal.clientDataHash) return 'challenge-journaled'
    return 'key-generated'
  }
  if (journal.assertion) return 'assertion-journaled'
  if (journal.clientDataHash) return 'challenge-journaled'
  if (journal.recoveryTokenHash) return 'token-journaled'
  return 'token-pending'
}

const pendingKind = (
  journal: LifecycleJournal
): NonNullable<NotesImportAuthSnapshot['pendingOperation']>['kind'] => {
  if (journal.kind === 'bootstrap') return 'bootstrap'
  if (journal.kind === 'enrollment') return 'enrollment'
  return journal.mode === 'recovery' ? 'recovery' : 'bind'
}

/**
 * Deep Notes Import authorization module. Callers provide a protected payload;
 * this module owns identity injection, protocol negotiation, all key lifecycle
 * transitions, exact-operation journaling, FIFO authorization, and redaction.
 */
export const createNotesImportAppAttest = (
  dependencies: NotesImportAppAttestDependencies
): NotesImportAppAttest => {
  const authorizationLane = new FifoLane()
  const lifecycleLane = new FifoLane()
  let protocolPromise: Promise<ProtocolVersion> | null = null
  let negotiatedProtocolVersion: ProtocolVersion | null = null

  const recoveryStorageSupported = (): boolean => {
    try {
      return dependencies.secureStore.supportsRecoveryStorage?.() ?? true
    } catch {
      return false
    }
  }

  const storage = <T>(operation: () => T): T => {
    try {
      return operation()
    } catch (error) {
      if (error instanceof NotesImportAppAttestError) throw error
      throw new NotesImportAppAttestError('storageFailure')
    }
  }

  const writeJournal = (journal: LifecycleJournal): void => {
    storage(() =>
      dependencies.persistence.writeJournal(
        JSON.stringify({ ...journal, updatedAt: dependencies.now() })
      )
    )
  }

  const readJournal = (): LifecycleJournal | null => {
    const raw = storage(() => dependencies.persistence.readJournal())
    if (raw === null) return null
    try {
      const journal = parseJournal(raw)
      const age = dependencies.now() - journal.updatedAt!
      if (age > JOURNAL_MAX_AGE_MS || age < -JOURNAL_MAX_FUTURE_SKEW_MS) {
        storage(() => dependencies.persistence.clearJournal())
        return null
      }
      return journal
    } catch {
      // Corrupt, restored, or obsolete transient state must never permanently
      // block authorization. It contains no recovery token and is safe to drop.
      storage(() => dependencies.persistence.clearJournal())
      return null
    }
  }

  const clearJournal = (): void => {
    storage(() => dependencies.persistence.clearJournal())
  }

  const readSecureActiveKeyId = (): string | null =>
    recoveryStorageSupported()
      ? storage(() => dependencies.secureStore.readActiveKeyId())
      : null

  const readActiveKeyIdWithMigration = (): string | null => {
    if (!recoveryStorageSupported()) {
      return storage(() => dependencies.persistence.readLegacyKeyId())
    }
    const secureKeyId = readSecureActiveKeyId()
    const legacyKeyId = storage(() =>
      dependencies.persistence.readLegacyKeyId()
    )
    if (secureKeyId) {
      if (legacyKeyId !== secureKeyId) {
        storage(() => dependencies.persistence.mirrorLegacyKeyId(secureKeyId))
      }
      return secureKeyId
    }
    if (!legacyKeyId) return null
    storage(() => dependencies.secureStore.writeActiveKeyId(legacyKeyId))
    storage(() => dependencies.persistence.mirrorLegacyKeyId(legacyKeyId))
    return legacyKeyId
  }

  const readRecoveryEnrollmentMarker = (): string | null =>
    recoveryStorageSupported()
      ? storage(() => dependencies.secureStore.readRecoveryEnrollmentKeyId())
      : null

  const recoveryEnrollmentMarker = (keyId: string, tokenHash: string): string =>
    `${keyId}|${tokenHash}`

  const recordRecoveryEnrollment = (keyId: string, tokenHash: string): void => {
    if (!recoveryStorageSupported()) return
    storage(() =>
      dependencies.secureStore.writeRecoveryEnrollmentKeyId(
        recoveryEnrollmentMarker(keyId, tokenHash)
      )
    )
  }

  const promoteCandidate = (
    keyId: string,
    protocol: ProtocolVersion,
    tokenHash?: string
  ): void => {
    if (protocol === 2 && !tokenHash) {
      throw new NotesImportAppAttestError('invalidState')
    }
    if (recoveryStorageSupported()) {
      storage(() => dependencies.secureStore.writeActiveKeyId(keyId))
    }
    // One rollback window: keep the legacy MMKV slot in sync while v1 clients
    // may still be installed, but never read it over a Keychain value.
    storage(() => dependencies.persistence.mirrorLegacyKeyId(keyId))
    if (protocol === 2) recordRecoveryEnrollment(keyId, tokenHash!)
    clearJournal()
  }

  const recoveryToken = (create: boolean): string | null => {
    if (!recoveryStorageSupported()) {
      if (create) throw new NotesImportAppAttestError('protocolUnavailable')
      return null
    }
    const token = storage(() =>
      create
        ? dependencies.secureStore.getOrCreateRecoveryToken()
        : dependencies.secureStore.readRecoveryToken()
    )
    if (token !== null && token.length === 0) {
      throw new NotesImportAppAttestError('storageFailure')
    }
    return token
  }

  const hashRecoveryToken = async (token: string): Promise<string> => {
    try {
      const hash = await dependencies.crypto.recoveryTokenHash(token)
      if (!isNonEmptyString(hash)) {
        throw new NotesImportAppAttestError('storageFailure')
      }
      return hash
    } catch (error) {
      if (error instanceof NotesImportAppAttestError) throw error
      throw new NotesImportAppAttestError('storageFailure')
    }
  }

  const hashProtectedRequest = async (
    payload: Record<string, unknown>
  ): Promise<string> => {
    const canonicalJson = canonicalProtectedRequest(payload)
    try {
      const hash = await dependencies.crypto.sha256Hex(canonicalJson)
      if (!/^[a-f0-9]{64}$/.test(hash)) {
        throw new NotesImportAppAttestError('systemFailure')
      }
      return hash
    } catch (error) {
      if (error instanceof NotesImportAppAttestError) throw error
      throw new NotesImportAppAttestError('systemFailure')
    }
  }

  const nativeError = (error: unknown): NotesImportAppAttestError => {
    const code = dependencies.appAttest.classifyError(error) ?? 'unknown'
    return new NotesImportAppAttestError(nativeFailureToErrorCode(code))
  }

  const invokeNative = async <T>(
    operation: () => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> => {
    throwIfAborted(signal)
    try {
      return await operation()
    } catch (firstError) {
      const firstCode = dependencies.appAttest.classifyError(firstError)
      if (firstCode !== 'serverUnavailable') throw nativeError(firstError)
      // Apple's required retry for DCError.serverUnavailable is the same key and
      // exact clientDataHash. The closure captures those immutable inputs.
      throwIfAborted(signal)
      try {
        return await operation()
      } catch (secondError) {
        throw nativeError(secondError)
      }
    }
  }

  const protocolVersion = (): Promise<ProtocolVersion> => {
    if (protocolPromise) return protocolPromise
    const pending = dependencies.transport
      .getStatus()
      .then(protocolVersionFromStatus)
      .then((version) =>
        version === 2 && !recoveryStorageSupported() ? 1 : version
      )
      .then((version) => {
        negotiatedProtocolVersion = version
        return version
      })
      .catch((error: unknown) => {
        if (error instanceof NotesImportAppAttestError) throw error
        if (error instanceof NotesImportAppAttestHttpError) {
          throw (
            httpAuthError(error) ??
            new NotesImportAppAttestError(
              'protocolUnavailable',
              semanticMetadata(error)
            )
          )
        }
        throw new NotesImportAppAttestError('protocolUnavailable')
      })
    protocolPromise = pending
    void pending.catch(() => {
      if (protocolPromise === pending) protocolPromise = null
    })
    return pending
  }

  const requestChallenge = async (input: {
    protocolVersion: ProtocolVersion
    operation: ChallengeOperation
    operationId: string
    uuid: string
    keyId: string
    purpose?: ProtectedPurpose
    accountId?: string
    contentHash?: string
    requestHash?: string
    signal?: AbortSignal
  }): Promise<string> => {
    throwIfAborted(input.signal)
    if (
      input.protocolVersion === 2 &&
      input.operation === 'assert' &&
      (!input.purpose ||
        !/^[a-f0-9]{64}$/.test(input.contentHash ?? '') ||
        !/^[a-f0-9]{64}$/.test(input.requestHash ?? ''))
    ) {
      throw new NotesImportAppAttestError('invalidInput')
    }
    const body =
      input.protocolVersion === 2
        ? {
            protocolVersion: 2,
            operation: input.operation,
            operationId: input.operationId,
            uuid: input.uuid,
            keyId: input.keyId,
            ...(input.operation === 'assert'
              ? {
                  purpose: input.purpose,
                  accountId: input.accountId,
                  contentHash: input.contentHash,
                  requestHash: input.requestHash,
                }
              : {}),
          }
        : {}
    const response = await dependencies.transport.post<unknown>(
      'challenge',
      body,
      { signal: input.signal }
    )
    if (!isRecord(response) || !isNonEmptyString(response.challenge)) {
      throw new NotesImportAppAttestError('invalidInput')
    }
    if (input.protocolVersion === 2) {
      if (
        response.protocolVersion !== 2 ||
        response.operation !== input.operation ||
        response.operationId !== input.operationId
      ) {
        throw new NotesImportAppAttestError('protocolUnavailable')
      }
    }
    return response.challenge
  }

  const postLifecycleOperation = async (
    body: Record<string, unknown>,
    protocol: ProtocolVersion,
    operation: 'bind' | 'enroll',
    operationId: string,
    signal?: AbortSignal
  ): Promise<void> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      throwIfAborted(signal)
      try {
        const response = await dependencies.transport.post<unknown>(
          'registration',
          body,
          { signal }
        )
        const valid =
          protocol === 1
            ? isV1Acknowledgement(response)
            : isV2RegistrationAcknowledgement(response, operation, operationId)
        if (!valid) {
          throw new NotesImportAppAttestError('authorizationFailed')
        }
        return
      } catch (error) {
        if (error instanceof NotesImportAppAttestError) throw error
        if (error instanceof NotesImportAppAttestHttpError) {
          if (startNewOperationRequested(error)) {
            throw (
              httpAuthError(error) ??
              new NotesImportAppAttestError(
                'authorizationFailed',
                semanticMetadata(error)
              )
            )
          }
          if (attempt === 0 && isRetryableLifecycleHttpError(error)) continue
          throw (
            httpAuthError(error) ??
            new NotesImportAppAttestError(
              'authorizationFailed',
              semanticMetadata(error)
            )
          )
        }
        throw new NotesImportAppAttestError('network')
      }
    }
  }

  const throwLifecycleError = (error: unknown): never => {
    if (error instanceof NotesImportAppAttestError) throw error
    if (error instanceof NotesImportAppAttestHttpError) {
      throw (
        httpAuthError(error) ??
        new NotesImportAppAttestError(
          'authorizationFailed',
          semanticMetadata(error)
        )
      )
    }
    throw new NotesImportAppAttestError('network')
  }

  async function completeCandidate(
    original: CandidateJournal,
    signal?: AbortSignal
  ): Promise<string> {
    if (
      !original.attestation &&
      original.attestationInFlight &&
      !original.attestationRetryable
    ) {
      // The process may have died after Apple's one-shot attestKey succeeded but
      // before its CBOR response reached durable storage. Repeating that call can
      // only yield invalidKey, so replace this unpromoted candidate once.
      if (original.operationRestartCount === 1) {
        // Keep the exhausted journal as a 24-hour tombstone so relaunches cannot
        // reset the replacement budget and generate Secure Enclave keys forever.
        throw new NotesImportAppAttestError('invalidState')
      }
      return startCandidate({
        protocolVersion: original.protocolVersion,
        mode: original.mode,
        operationId: dependencies.crypto.randomUuid(),
        uuid: original.uuid,
        operationRestartCount: 1,
        recoveryTokenHash: original.recoveryTokenHash,
        signal,
      })
    }

    try {
      let candidate = original
      let token: string | null = null
      if (candidate.protocolVersion === 2) {
        token = recoveryToken(false)
        if (!token) throw new NotesImportAppAttestError('recoveryUnavailable')
        const actualTokenHash = await hashRecoveryToken(token)
        if (actualTokenHash !== candidate.recoveryTokenHash) {
          throw new NotesImportAppAttestError('invalidState')
        }
      }

      if (!candidate.clientDataHash) {
        const challenge = await requestChallenge({
          protocolVersion: candidate.protocolVersion,
          operation: 'bind',
          operationId: candidate.operationId,
          uuid: candidate.uuid,
          keyId: candidate.keyId,
          signal,
        })
        const clientData =
          candidate.protocolVersion === 2
            ? buildBindClientData({
                operationId: candidate.operationId,
                challenge,
                uuid: candidate.uuid,
                recoveryTokenHash: candidate.recoveryTokenHash!,
              })
            : challenge
        const clientDataHash =
          await dependencies.crypto.sha256Base64(clientData)
        candidate = { ...candidate, challenge, clientData, clientDataHash }
        // Persist the exact challenge and exact client data before asking Apple.
        writeJournal(candidate)
      }

      if (!candidate.attestation) {
        throwIfAborted(signal)
        candidate = {
          ...candidate,
          attestationInFlight: true,
          attestationRetryable: false,
        }
        writeJournal(candidate)
        try {
          const attestation = await invokeNative(
            () =>
              dependencies.appAttest.attestKey(
                candidate.keyId,
                candidate.clientDataHash!
              ),
            signal
          )
          candidate = {
            ...candidate,
            attestation,
            attestationInFlight: false,
            attestationRetryable: false,
          }
          // Persist Apple's exact CBOR blob before registration. If the process
          // dies before this write, the in-flight marker burns this candidate.
          writeJournal(candidate)
        } catch (error) {
          if (
            error instanceof NotesImportAppAttestError &&
            error.code === 'serverUnavailable'
          ) {
            candidate = {
              ...candidate,
              attestationInFlight: false,
              attestationRetryable: true,
            }
            writeJournal(candidate)
          }
          throw error
        }
      }

      const body: Record<string, unknown> =
        candidate.protocolVersion === 2
          ? {
              protocolVersion: 2,
              operation: 'bind',
              operationId: candidate.operationId,
              uuid: candidate.uuid,
              keyId: candidate.keyId,
              challenge: candidate.challenge,
              attestation: candidate.attestation,
              recoveryToken: token,
            }
          : {
              protocolVersion: 1,
              keyId: candidate.keyId,
              attestation: candidate.attestation,
              challenge: candidate.challenge,
              uuid: candidate.uuid,
            }
      await postLifecycleOperation(
        body,
        candidate.protocolVersion,
        'bind',
        candidate.operationId,
        signal
      )
      promoteCandidate(
        candidate.keyId,
        candidate.protocolVersion,
        candidate.recoveryTokenHash
      )
      return candidate.keyId
    } catch (error) {
      if (
        original.protocolVersion !== 2 ||
        !startNewOperationRequested(error)
      ) {
        return throwLifecycleError(error)
      }
      throwIfAborted(signal)
      if (original.operationRestartCount === 1) {
        // Preserve the exhausted operation as a TTL-bounded tombstone. Clearing it
        // would let each user retry reset the budget and generate another key.
        return throwLifecycleError(error)
      }
      return startCandidate({
        protocolVersion: 2,
        mode: original.mode,
        operationId: dependencies.crypto.randomUuid(),
        uuid: original.uuid,
        operationRestartCount: 1,
        recoveryTokenHash: original.recoveryTokenHash,
        signal,
      })
    }
  }

  async function completeBootstrap(
    original: BootstrapJournal,
    signal?: AbortSignal
  ): Promise<string> {
    let bootstrap = original
    if (bootstrap.protocolVersion === 2) {
      const token = bootstrap.recoveryTokenHash
        ? recoveryToken(false)
        : recoveryToken(true)
      if (!token) throw new NotesImportAppAttestError('recoveryUnavailable')
      const actualTokenHash = await hashRecoveryToken(token)
      if (
        bootstrap.recoveryTokenHash &&
        bootstrap.recoveryTokenHash !== actualTokenHash
      ) {
        throw new NotesImportAppAttestError('invalidState')
      }
      if (!bootstrap.recoveryTokenHash) {
        bootstrap = { ...bootstrap, recoveryTokenHash: actualTokenHash }
        writeJournal(bootstrap)
      }
    }

    if (bootstrap.generationInFlight) {
      if (bootstrap.operationRestartCount === 1) {
        // The second generation result was also lost. Keep this marker until its
        // TTL expires rather than creating an unbounded stream of orphaned keys.
        throw new NotesImportAppAttestError('invalidState')
      }
      bootstrap = {
        ...bootstrap,
        operationId: dependencies.crypto.randomUuid(),
        operationRestartCount: 1,
        generationInFlight: false,
      }
      writeJournal(bootstrap)
    }

    throwIfAborted(signal)
    bootstrap = { ...bootstrap, generationInFlight: true }
    // No key id exists yet, so this durable marker is the only way to bound the
    // crash gap between generateKey creating a key and returning its identifier.
    writeJournal(bootstrap)

    let keyId: string
    try {
      keyId = await dependencies.appAttest.generateKey()
    } catch (error) {
      const classified = nativeError(error)
      if (classified.code === 'serverUnavailable') {
        // Apple explicitly permits retrying an observed availability failure.
        bootstrap = { ...bootstrap, generationInFlight: false }
        writeJournal(bootstrap)
      }
      throwIfAborted(signal)
      throw classified
    }
    if (!isNonEmptyString(keyId)) {
      throw new NotesImportAppAttestError('nativeUnknown')
    }

    const candidate: CandidateJournal = {
      v: JOURNAL_VERSION,
      kind: 'candidate',
      protocolVersion: bootstrap.protocolVersion,
      mode: bootstrap.mode,
      operationId: bootstrap.operationId,
      uuid: bootstrap.uuid,
      keyId,
      operationRestartCount: bootstrap.operationRestartCount,
      recoveryTokenHash: bootstrap.recoveryTokenHash,
    }
    // Persist the returned key before observing cancellation. A canceled caller
    // can stop, while the next caller resumes this exact candidate.
    writeJournal(candidate)
    return completeCandidate(candidate, signal)
  }

  async function startCandidate(input: {
    protocolVersion: ProtocolVersion
    mode: 'initial' | 'recovery'
    operationId: string
    uuid: string
    operationRestartCount?: 0 | 1
    recoveryTokenHash?: string
    signal?: AbortSignal
  }): Promise<string> {
    throwIfAborted(input.signal)
    const bootstrap: BootstrapJournal = {
      v: JOURNAL_VERSION,
      kind: 'bootstrap',
      protocolVersion: input.protocolVersion,
      mode: input.mode,
      operationId: input.operationId,
      uuid: input.uuid,
      operationRestartCount: input.operationRestartCount ?? 0,
      recoveryTokenHash: input.recoveryTokenHash,
      generationInFlight: false,
    }
    writeJournal(bootstrap)
    return completeBootstrap(bootstrap, input.signal)
  }

  async function completeEnrollment(
    original: EnrollmentJournal,
    signal?: AbortSignal
  ): Promise<string> {
    let enrollment = original
    try {
      const existingToken = recoveryToken(false)
      const token =
        existingToken ??
        (enrollment.recoveryTokenHash ? null : recoveryToken(true))
      if (!token) throw new NotesImportAppAttestError('recoveryUnavailable')
      const actualTokenHash = await hashRecoveryToken(token)
      if (
        enrollment.recoveryTokenHash &&
        enrollment.recoveryTokenHash !== actualTokenHash
      ) {
        throw new NotesImportAppAttestError('invalidState')
      }
      if (!enrollment.recoveryTokenHash) {
        enrollment = { ...enrollment, recoveryTokenHash: actualTokenHash }
        writeJournal(enrollment)
      }

      return await authorizationLane.run(
        enrollment.keyId,
        async () => {
          if (!enrollment.clientDataHash) {
            const challenge = await requestChallenge({
              protocolVersion: 2,
              operation: 'enroll',
              operationId: enrollment.operationId,
              uuid: enrollment.uuid,
              keyId: enrollment.keyId,
              signal,
            })
            const clientData = buildEnrollClientData({
              operationId: enrollment.operationId,
              challenge,
              uuid: enrollment.uuid,
              keyId: enrollment.keyId,
              recoveryTokenHash: enrollment.recoveryTokenHash!,
            })
            const clientDataHash =
              await dependencies.crypto.sha256Base64(clientData)
            enrollment = {
              ...enrollment,
              challenge,
              clientData,
              clientDataHash,
            }
            writeJournal(enrollment)
          }
          if (!enrollment.assertion) {
            const assertion = await invokeNative(
              () =>
                dependencies.appAttest.generateAssertion(
                  enrollment.keyId,
                  enrollment.clientDataHash!
                ),
              signal
            )
            enrollment = { ...enrollment, assertion }
            writeJournal(enrollment)
          }
          await postLifecycleOperation(
            {
              protocolVersion: 2,
              operation: 'enroll',
              operationId: enrollment.operationId,
              uuid: enrollment.uuid,
              keyId: enrollment.keyId,
              challenge: enrollment.challenge,
              assertion: enrollment.assertion,
              recoveryToken: token,
            },
            2,
            'enroll',
            enrollment.operationId,
            signal
          )
          recordRecoveryEnrollment(enrollment.keyId, actualTokenHash)
          clearJournal()
          return enrollment.keyId
        },
        signal
      )
    } catch (error) {
      if (!startNewOperationRequested(error)) {
        return throwLifecycleError(error)
      }
      throwIfAborted(signal)
      if (original.operationRestartCount === 1) {
        // Keep the exhausted enrollment receipt until TTL expiry so retries do not
        // silently reset the one-restart operation budget.
        return throwLifecycleError(error)
      }
      const replacement: EnrollmentJournal = {
        v: JOURNAL_VERSION,
        kind: 'enrollment',
        protocolVersion: 2,
        operationId: dependencies.crypto.randomUuid(),
        uuid: enrollment.uuid,
        keyId: enrollment.keyId,
        operationRestartCount: 1,
        recoveryTokenHash: enrollment.recoveryTokenHash,
      }
      // A new operation requires a fresh challenge, hash, and assertion, while
      // retaining the same active key and recovery-token material.
      writeJournal(replacement)
      return completeEnrollment(replacement, signal)
    }
  }

  const startEnrollment = async (
    keyId: string,
    uuid: string,
    signal?: AbortSignal
  ): Promise<string> => {
    throwIfAborted(signal)
    const recoveryTokenPredatedEnrollment = recoveryToken(false) !== null
    const enrollment: EnrollmentJournal = {
      v: JOURNAL_VERSION,
      kind: 'enrollment',
      protocolVersion: 2,
      operationId: dependencies.crypto.randomUuid(),
      uuid,
      keyId,
      operationRestartCount: 0,
    }
    // This marker closes the crash gap between token creation and enrollment.
    writeJournal(enrollment)
    try {
      return await completeEnrollment(enrollment, signal)
    } catch (error) {
      if (
        error instanceof NotesImportAppAttestError &&
        error.code === 'invalidKey'
      ) {
        // Enrollment may have committed before its response was lost and the app
        // was then reinstalled. Try a token that predates this enrollment once;
        // a token created moments before the local invalidKey was never enrolled.
        if (!recoveryTokenPredatedEnrollment) {
          throw new NotesImportAppAttestError('recoveryUnavailable')
        }
        const token = recoveryToken(false)
        if (!token) {
          throw new NotesImportAppAttestError('recoveryUnavailable')
        }
        const tokenHash = await hashRecoveryToken(token)
        clearJournal()
        return startCandidate({
          protocolVersion: 2,
          mode: 'recovery',
          operationId: dependencies.crypto.randomUuid(),
          uuid,
          recoveryTokenHash: tokenHash,
          signal,
        })
      }
      throw error
    }
  }

  const resumeJournal = async (
    journal: LifecycleJournal,
    signal?: AbortSignal
  ): Promise<string> => {
    const currentUuid = storage(() => dependencies.identity.peekUuid())
    if (currentUuid !== journal.uuid) {
      clearJournal()
      throw new NotesImportAppAttestError('invalidState')
    }
    if (journal.kind === 'candidate') {
      return completeCandidate(journal, signal)
    }
    if (journal.kind === 'enrollment') {
      return completeEnrollment(journal, signal)
    }

    return completeBootstrap(journal, signal)
  }

  const ensureReady = async (
    desiredProtocol: ProtocolVersion,
    signal?: AbortSignal
  ): Promise<{ keyId: string; uuid: string; accountId: string }> =>
    lifecycleLane.run(
      'lifecycle',
      async () => {
        let journal = readJournal()
        let uuid = storage(() => dependencies.identity.peekUuid())

        if (journal && (!uuid || journal.uuid !== uuid)) {
          // The journal is device/install-bound. A restored Documents container
          // cannot carry it onto a device where this-device-only Keychain state
          // is missing or different.
          clearJournal()
          journal = null
        }
        if (journal) {
          await resumeJournal(journal, signal)
          journal = null
          uuid = storage(() => dependencies.identity.peekUuid())
        }

        if (!uuid) {
          const activeWithoutIdentity = readActiveKeyIdWithMigration()
          const tokenWithoutIdentity = recoveryToken(false)
          if (activeWithoutIdentity || tokenWithoutIdentity) {
            throw new NotesImportAppAttestError('invalidState')
          }
          uuid = storage(() => dependencies.identity.getOrCreateUuid())
          if (!uuid) throw new NotesImportAppAttestError('storageFailure')
          const bootstrap: BootstrapJournal = {
            v: JOURNAL_VERSION,
            kind: 'bootstrap',
            protocolVersion: desiredProtocol,
            mode: 'initial',
            operationId: dependencies.crypto.randomUuid(),
            uuid,
            operationRestartCount: 0,
            generationInFlight: false,
          }
          writeJournal(bootstrap)
          await resumeJournal(bootstrap, signal)
        }

        let keyId = readActiveKeyIdWithMigration()
        if (!keyId) {
          if (desiredProtocol === 1) {
            if (recoveryToken(false)) {
              // A recovery-capable reinstall must wait for v2; v1 has no token
              // proof and must never consume this state with a blind bind.
              throw new NotesImportAppAttestError('protocolUnavailable')
            }
            // Contained v1 first-use compatibility: the deployed server's
            // first-writer UUID pin accepts only an unbound identity. A reinstall
            // with an existing owner is rejected, this exact candidate stays
            // journaled, and no replacement is generated or promoted.
            const bootstrap: BootstrapJournal = {
              v: JOURNAL_VERSION,
              kind: 'bootstrap',
              protocolVersion: 1,
              mode: 'initial',
              operationId: dependencies.crypto.randomUuid(),
              uuid,
              operationRestartCount: 0,
              generationInFlight: false,
            }
            writeJournal(bootstrap)
            keyId = await resumeJournal(bootstrap, signal)
          } else {
            const existingToken = recoveryToken(false)
            if (existingToken) {
              const tokenHash = await hashRecoveryToken(existingToken)
              keyId = await startCandidate({
                protocolVersion: 2,
                mode: 'recovery',
                operationId: dependencies.crypto.randomUuid(),
                uuid,
                recoveryTokenHash: tokenHash,
                signal,
              })
            } else {
              // This may be first use on an install whose UUID was created by the
              // account provider. The server accepts bind only for an unbound UUID;
              // a pre-v2 reinstall with a legacy owner receives
              // recovery_not_enrolled and this candidate is never promoted.
              const bootstrap: BootstrapJournal = {
                v: JOURNAL_VERSION,
                kind: 'bootstrap',
                protocolVersion: 2,
                mode: 'initial',
                operationId: dependencies.crypto.randomUuid(),
                uuid,
                operationRestartCount: 0,
                generationInFlight: false,
              }
              writeJournal(bootstrap)
              keyId = await resumeJournal(bootstrap, signal)
            }
          }
        }

        if (desiredProtocol === 2) {
          const token = recoveryToken(false)
          const tokenHash = token ? await hashRecoveryToken(token) : null
          const expectedMarker = tokenHash
            ? recoveryEnrollmentMarker(keyId, tokenHash)
            : null
          if (
            !expectedMarker ||
            readRecoveryEnrollmentMarker() !== expectedMarker
          ) {
            keyId = await startEnrollment(keyId, uuid, signal)
          }
        }

        const accountId = storage(() => dependencies.identity.getAccountId())
        if (!accountId) throw new NotesImportAppAttestError('storageFailure')
        return { keyId, uuid, accountId }
      },
      signal
    )

  const recoverKey = async (
    protocol: ProtocolVersion,
    failedKeyId: string,
    uuid: string,
    signal?: AbortSignal
  ): Promise<string> => {
    if (protocol !== 2) {
      throw new NotesImportAppAttestError('invalidKey')
    }
    return lifecycleLane.run(
      'lifecycle',
      async () => {
        const currentKeyId = readActiveKeyIdWithMigration()
        if (currentKeyId && currentKeyId !== failedKeyId) return currentKeyId

        const pending = readJournal()
        if (pending) return resumeJournal(pending, signal)

        const token = recoveryToken(false)
        if (!token) throw new NotesImportAppAttestError('recoveryUnavailable')
        const tokenHash = await hashRecoveryToken(token)
        return startCandidate({
          protocolVersion: 2,
          mode: 'recovery',
          operationId: dependencies.crypto.randomUuid(),
          uuid,
          recoveryTokenHash: tokenHash,
          signal,
        })
      },
      signal
    )
  }

  const recoveryRequested = (error: unknown): boolean =>
    error instanceof NotesImportAppAttestHttpError &&
    ((error.reason !== undefined &&
      RECOVERY_SERVER_REASONS.has(error.reason)) ||
      error.serverCode === 'key_inactive' ||
      error.serverCode === 'recovery_required')

  const throwProtectedError = (error: unknown): never => {
    if (error instanceof NotesImportAppAttestError) throw error
    if (error instanceof NotesImportAppAttestHttpError) {
      const authError = httpAuthError(error)
      if (authError) throw authError
      throw error
    }
    throw new NotesImportAppAttestError('network')
  }

  const protectedAttempt = async <T>(input: {
    protocol: ProtocolVersion
    endpoint: NotesImportProtectedEndpoint | 'verify'
    purpose: ProtectedPurpose
    payload: Record<string, unknown>
    contentHash: string
    requestHash?: string
    operationId: string
    keyId: string
    uuid: string
    accountId: string
    allowRecovery: boolean
    allowFreshOperation: boolean
    signal?: AbortSignal
  }): Promise<ProtectedAttempt<T>> =>
    authorizationLane.run(
      input.keyId,
      async () => {
        const currentKeyId = readSecureActiveKeyId()
        if (currentKeyId && currentKeyId !== input.keyId) {
          return { kind: 'retryWithCurrentKey', keyId: currentKeyId }
        }

        let challenge: string
        try {
          challenge = await requestChallenge({
            protocolVersion: input.protocol,
            operation: 'assert',
            operationId: input.operationId,
            uuid: input.uuid,
            keyId: input.keyId,
            purpose: input.purpose,
            accountId: input.accountId,
            contentHash: input.contentHash,
            requestHash: input.requestHash,
            signal: input.signal,
          })
        } catch (error) {
          if (input.allowRecovery && recoveryRequested(error)) {
            return { kind: 'recover' }
          }
          if (input.allowFreshOperation && startNewOperationRequested(error)) {
            return { kind: 'retryWithFreshOperation' }
          }
          return throwProtectedError(error)
        }

        const clientData =
          input.protocol === 2
            ? buildAssertionClientData({
                purpose: input.purpose,
                operationId: input.operationId,
                challenge,
                uuid: input.uuid,
                accountId: input.accountId,
                contentHash: input.contentHash,
                requestHash: input.requestHash!,
              })
            : `${challenge}|${input.uuid}|${input.accountId}|${input.contentHash}`
        const clientDataHash =
          await dependencies.crypto.sha256Base64(clientData)

        let assertion: string
        try {
          assertion = await invokeNative(
            () =>
              dependencies.appAttest.generateAssertion(
                input.keyId,
                clientDataHash
              ),
            input.signal
          )
        } catch (error) {
          if (
            input.allowRecovery &&
            error instanceof NotesImportAppAttestError &&
            error.code === 'invalidKey'
          ) {
            return { kind: 'recover' }
          }
          throw error
        }

        const body = {
          ...input.payload,
          ...(input.protocol === 2
            ? {
                protocolVersion: 2,
                operation: 'assert',
                purpose: input.purpose,
                operationId: input.operationId,
                requestHash: input.requestHash,
              }
            : {}),
          uuid: input.uuid,
          accountId: input.accountId,
          contentHash: input.contentHash,
          keyId: input.keyId,
          challenge,
          assertion,
        }
        try {
          const data = await dependencies.transport.post<T>(
            input.endpoint,
            body,
            { signal: input.signal }
          )
          return { kind: 'success', data }
        } catch (error) {
          if (input.allowRecovery && recoveryRequested(error)) {
            return { kind: 'recover' }
          }
          if (input.allowFreshOperation && startNewOperationRequested(error)) {
            return { kind: 'retryWithFreshOperation' }
          }
          return throwProtectedError(error)
        }
      },
      input.signal
    )

  const postProtected = async <T>(input: {
    protocol: ProtocolVersion
    endpoint: NotesImportProtectedEndpoint | 'verify'
    purpose: ProtectedPurpose
    payload: Record<string, unknown>
    contentHash: string
    requestHash?: string
    operationId: string
    keyId: string
    uuid: string
    accountId: string
    signal?: AbortSignal
  }): Promise<T> => {
    let keyId = input.keyId
    let operationId = input.operationId
    let allowRecovery = true
    let allowFreshOperation = input.protocol === 2
    for (;;) {
      throwIfAborted(input.signal)
      const result = await protectedAttempt<T>({
        ...input,
        operationId,
        keyId,
        allowRecovery,
        allowFreshOperation,
      })
      if (result.kind === 'success') return result.data
      if (result.kind === 'retryWithCurrentKey') {
        keyId = result.keyId
        continue
      }
      if (result.kind === 'retryWithFreshOperation') {
        operationId = dependencies.crypto.randomUuid()
        allowFreshOperation = false
        continue
      }
      if (!allowRecovery) {
        throw new NotesImportAppAttestError('keyInactive')
      }
      keyId = await recoverKey(input.protocol, keyId, input.uuid, input.signal)
      // A challenge operation is bound to the old key in v2, so a controlled
      // recovery retry needs a fresh correlation id rather than conflicting
      // with that rejected descriptor.
      operationId = dependencies.crypto.randomUuid()
      allowRecovery = false
    }
  }

  const readonlyActiveKey = (): string | null => {
    const secure = readSecureActiveKeyId()
    if (secure) return secure
    return storage(() => dependencies.persistence.readLegacyKeyId())
  }

  const diagnosticErrorCode = (
    error: unknown
  ): NotesImportAppAttestErrorCode => {
    if (error instanceof NotesImportAppAttestError) return error.code
    if (error instanceof NotesImportAppAttestHttpError) {
      return httpAuthError(error)?.code ?? 'authorizationFailed'
    }
    return nativeError(error).code
  }

  const getSnapshot = (): NotesImportAuthSnapshot => {
    let installIdentity: NotesImportAuthSnapshot['installIdentity'] = 'missing'
    let accountIdentity: NotesImportAuthSnapshot['accountIdentity'] = 'missing'
    let activeKey: NotesImportAuthSnapshot['activeKey'] = 'missing'
    let tokenState: NotesImportAuthSnapshot['recoveryToken'] = 'missing'
    let pendingOperation: NotesImportAuthSnapshot['pendingOperation'] = null

    let uuid: string | null = null
    try {
      uuid = dependencies.identity.peekUuid()
      installIdentity = uuid ? 'present' : 'missing'
    } catch {
      installIdentity = 'error'
    }
    if (uuid) {
      try {
        accountIdentity =
          dependencies.identity.getAccountId() === uuid ? 'local' : 'adopted'
      } catch {
        accountIdentity = 'error'
      }
    }
    try {
      const secure = recoveryStorageSupported()
        ? dependencies.secureStore.readActiveKeyId()
        : null
      const legacy = dependencies.persistence.readLegacyKeyId()
      activeKey = secure
        ? 'keychain'
        : legacy
          ? 'legacyMigrationPending'
          : 'missing'
    } catch {
      activeKey = 'error'
    }
    try {
      tokenState =
        recoveryStorageSupported() &&
        dependencies.secureStore.readRecoveryToken()
          ? 'present'
          : 'missing'
    } catch {
      tokenState = 'error'
    }
    try {
      const raw = dependencies.persistence.readJournal()
      if (raw) {
        try {
          const journal = parseJournal(raw)
          pendingOperation = {
            kind: pendingKind(journal),
            stage: pendingStage(journal),
            correlationId: journal.operationId,
          }
        } catch {
          pendingOperation = { kind: 'invalid', stage: 'unreadable' }
        }
      }
    } catch {
      pendingOperation = { kind: 'invalid', stage: 'storage-error' }
    }

    let appAttestSupported = false
    try {
      appAttestSupported = dependencies.appAttest.isSupported()
    } catch {
      appAttestSupported = false
    }

    return {
      baseUrl: dependencies.baseUrl,
      devBypassEnabled: dependencies.devBypass.enabled,
      appAttestSupported,
      negotiatedProtocolVersion,
      installIdentity,
      accountIdentity,
      activeKey,
      recoveryToken: tokenState,
      pendingOperation,
    }
  }

  const runDiagnostics = async (): Promise<NotesImportAuthDebugReport> => {
    const operationId = dependencies.crypto.randomUuid()
    const report: NotesImportAuthDebugReport = {
      ok: false,
      protocolVersion: null,
      correlationId: operationId,
      steps: [],
    }
    const step = async <T>(
      name: string,
      operation: () => Promise<T>
    ): Promise<{ ok: true; value: T } | { ok: false }> => {
      const started = dependencies.now()
      try {
        const value = await operation()
        report.steps.push({
          step: name,
          ok: true,
          ms: Math.max(0, dependencies.now() - started),
        })
        return { ok: true, value }
      } catch (error) {
        report.steps.push({
          step: name,
          ok: false,
          ms: Math.max(0, dependencies.now() - started),
          code: diagnosticErrorCode(error),
        })
        return { ok: false }
      }
    }

    if (dependencies.devBypass.enabled) {
      return authorizationLane.run('dev-bypass', async () => {
        const capability = await step('capability', () => protocolVersion())
        if (!capability.ok) return report
        const protocol = capability.value
        report.protocolVersion = protocol
        const identity = await step('identity', async () => ({
          uuid: storage(() => dependencies.identity.getOrCreateUuid()),
          accountId: storage(() => dependencies.identity.getAccountId()),
        }))
        if (!identity.ok) return report
        const verify = await step('verify', async () => {
          const response = await dependencies.transport.post<unknown>(
            'verify',
            {
              ...(protocol === 2
                ? {
                    protocolVersion: 2,
                    operation: 'assert',
                    purpose: 'notes-import-verify',
                    operationId,
                    requestHash: DIAGNOSTIC_CONTENT_HASH,
                  }
                : {}),
              uuid: identity.value.uuid,
              accountId: identity.value.accountId,
              contentHash: DIAGNOSTIC_CONTENT_HASH,
            },
            {
              headers: {
                'x-ww-dev-bypass': dependencies.devBypass.token,
              },
            }
          )
          if (!isAssertionAcknowledgement(response, protocol, operationId)) {
            throw new NotesImportAppAttestError('authorizationFailed')
          }
          return response
        })
        report.ok = verify.ok
        return report
      })
    }

    let keyId: string | null
    let uuid: string | null
    try {
      keyId = readonlyActiveKey()
      uuid = storage(() => dependencies.identity.peekUuid())
    } catch (error) {
      report.steps.push({
        step: 'read-state',
        ok: false,
        ms: 0,
        code: diagnosticErrorCode(error),
      })
      return report
    }
    if (!keyId || !uuid) {
      report.steps.push({
        step: 'existing-key',
        ok: false,
        ms: 0,
        code: 'recoveryUnavailable',
      })
      return report
    }

    return authorizationLane.run(keyId, async () => {
      const capability = await step('capability', () => protocolVersion())
      if (!capability.ok) return report
      const protocol = capability.value
      report.protocolVersion = protocol
      const accountIdentity = await step('account-state', async () =>
        storage(() => dependencies.identity.getAccountId())
      )
      if (!accountIdentity.ok) return report
      const accountId = accountIdentity.value
      const challengeResult = await step('challenge', () =>
        requestChallenge({
          protocolVersion: protocol,
          operation: 'assert',
          operationId,
          uuid: uuid!,
          keyId: keyId!,
          purpose: 'notes-import-verify',
          accountId,
          contentHash: DIAGNOSTIC_CONTENT_HASH,
          requestHash: DIAGNOSTIC_CONTENT_HASH,
        })
      )
      if (!challengeResult.ok) return report
      const challenge = challengeResult.value
      const clientData =
        protocol === 2
          ? buildAssertionClientData({
              purpose: 'notes-import-verify',
              operationId,
              challenge,
              uuid: uuid!,
              accountId,
              contentHash: DIAGNOSTIC_CONTENT_HASH,
              requestHash: DIAGNOSTIC_CONTENT_HASH,
            })
          : `${challenge}|${uuid}|${accountId}|${DIAGNOSTIC_CONTENT_HASH}`
      const clientDataHashResult = await step('client-data-hash', () =>
        dependencies.crypto.sha256Base64(clientData)
      )
      if (!clientDataHashResult.ok) return report
      const assertionResult = await step('assertion', () =>
        invokeNative(() =>
          dependencies.appAttest.generateAssertion(
            keyId!,
            clientDataHashResult.value
          )
        )
      )
      if (!assertionResult.ok) return report
      const verify = await step('verify', async () => {
        const response = await dependencies.transport.post<unknown>('verify', {
          ...(protocol === 2
            ? {
                protocolVersion: 2,
                operation: 'assert',
                purpose: 'notes-import-verify',
                operationId,
                requestHash: DIAGNOSTIC_CONTENT_HASH,
              }
            : {}),
          uuid,
          accountId,
          contentHash: DIAGNOSTIC_CONTENT_HASH,
          keyId,
          challenge,
          assertion: assertionResult.value,
        })
        if (!isAssertionAcknowledgement(response, protocol, operationId)) {
          throw new NotesImportAppAttestError('authorizationFailed')
        }
        return response
      })
      report.ok = verify.ok
      return report
    })
  }

  return {
    async post<T>(request: NotesImportProtectedPost): Promise<T> {
      const { endpoint, payload, contentHash, signal } = request
      throwIfAborted(signal)
      const purpose = purposeForEndpoint(endpoint)
      const operationId = dependencies.crypto.randomUuid()
      let requestHashPromise: Promise<string> | null = null
      const getRequestHash = (): Promise<string> =>
        (requestHashPromise ??= hashProtectedRequest(payload))

      if (dependencies.devBypass.enabled) {
        const uuid = storage(() => dependencies.identity.getOrCreateUuid())
        const accountId = storage(() => dependencies.identity.getAccountId())
        const requestHash =
          endpoint === 'kickoff' ? await getRequestHash() : undefined
        return authorizationLane.run(
          'dev-bypass',
          () =>
            dependencies.transport.post<T>(
              endpoint,
              {
                ...payload,
                ...(endpoint === 'kickoff'
                  ? {
                      protocolVersion: 2,
                      operation: 'assert',
                      purpose,
                      operationId,
                      requestHash,
                    }
                  : {}),
                uuid,
                accountId,
                contentHash,
              },
              {
                headers: {
                  'x-ww-dev-bypass': dependencies.devBypass.token,
                },
                signal,
              }
            ),
          signal
        )
      }

      let supported = false
      try {
        supported = dependencies.appAttest.isSupported()
      } catch {
        throw new NotesImportAppAttestError('nativeUnknown')
      }
      if (!supported) {
        throw new NotesImportAppAttestError('unsupported')
      }
      const negotiatedProtocol = await waitForSignal(protocolVersion(), signal)
      const ready = await ensureReady(negotiatedProtocol, signal)
      const protectedProtocol = endpoint === 'legacy' ? 1 : negotiatedProtocol
      const requestHash =
        protectedProtocol === 2 ? await getRequestHash() : undefined
      return postProtected<T>({
        protocol: protectedProtocol,
        endpoint,
        purpose,
        payload,
        contentHash,
        requestHash,
        operationId,
        keyId: ready.keyId,
        uuid: ready.uuid,
        accountId: ready.accountId,
        signal,
      })
    },
    async prepareRecovery(): Promise<void> {
      if (
        dependencies.devBypass.enabled ||
        !recoveryStorageSupported() ||
        !readonlyActiveKey()
      ) {
        return
      }
      let supported = false
      try {
        supported = dependencies.appAttest.isSupported()
      } catch {
        return
      }
      if (!supported || (await protocolVersion()) !== 2) return
      await ensureReady(2)
    },
    getSnapshot,
    runDiagnostics,
  }
}
