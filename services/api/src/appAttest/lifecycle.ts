import type { Environment } from '../types'
import { issueChallenge as issueLegacyChallenge } from './challenge'
import { AppAttestError, type AppAttestFailure } from './errors'
import {
  isAppAttestAssertionPurpose,
  isAppAttestChallenge,
  isAppAttestKeyId,
  isAppAttestOperationId,
  isAppAttestUuid,
  type AppAttestOperation,
  type ProtectedAssertionBinding,
  type V1AssertionRequest,
  type V1AssertionResponse,
  type V1ChallengeResponse,
  type V1RegistrationRequest,
  type V1RegistrationResponse,
  type V2AssertionRequest,
  type V2AssertionResponse,
  type V2ChallengeRequest,
  type V2ChallengeResponse,
  type V2RegistrationRequest,
  type V2RegistrationResponse,
} from './protocol'
import type { AppAttestDoResult, AppAttestIdentity } from './identityDO'

export type AppAttestChallengeResponse =
  | V1ChallengeResponse
  | V2ChallengeResponse
export type AppAttestRegistrationResponse =
  | V1RegistrationResponse
  | V2RegistrationResponse
export type AppAttestAssertionResponse =
  | V1AssertionResponse
  | V2AssertionResponse

/**
 * Route-facing deep-module seam. Callers supply wire input plus the protected
 * values they already parsed; storage, migration, replay, counter, and recovery
 * policy stay behind these three methods.
 */
export interface AppAttestLifecycle {
  issueChallenge(input?: unknown): Promise<AppAttestChallengeResponse>
  register(input: unknown): Promise<AppAttestRegistrationResponse>
  verifyAssertion(
    input: unknown,
    binding: ProtectedAssertionBinding
  ): Promise<AppAttestAssertionResponse>
}

type IdentityStub = DurableObjectStub<AppAttestIdentity>

type RecordValue = Record<string, unknown>

const asRecord = (value: unknown): RecordValue | null =>
  value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : null

const stringField = (
  record: RecordValue,
  name: string,
  maxLength = 131_072
): string | null => {
  const value = record[name]
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
    ? value
    : null
}

const optionalStringField = (
  record: RecordValue,
  name: string,
  maxLength = 256
): string | undefined | null => {
  if (record[name] == null) return undefined
  return stringField(record, name, maxLength)
}

const invalidRequest = (message: string): never => {
  throw new AppAttestError(message, {
    reason: 'invalid_request',
    action: 'none',
    status: 400,
  })
}

const protocolVersion = (input: RecordValue | null): 1 | 2 => {
  const value = input?.protocolVersion
  if (value == null || value === 1) return 1
  if (value === 2) return 2
  throw new AppAttestError('Unsupported App Attest protocolVersion', {
    reason: 'unsupported_protocol',
    action: 'none',
    status: 400,
  })
}

/** Route helper for retaining v1 status/code behavior on expected failures. */
export const appAttestProtocolVersion = (input: unknown): 1 | 2 | null => {
  const record = asRecord(input)
  const value = record?.protocolVersion
  if (value == null || value === 1) return 1
  if (value === 2) return 2
  return null
}

const parseV2Challenge = (record: RecordValue): V2ChallengeRequest => {
  const operation = stringField(record, 'operation', 16) as AppAttestOperation | null
  const operationId = stringField(record, 'operationId', 128)
  const uuid = stringField(record, 'uuid', 64)
  const keyId = stringField(record, 'keyId', 256)
  if (
    (operation !== 'bind' && operation !== 'enroll' && operation !== 'assert') ||
    !operationId ||
    !isAppAttestOperationId(operationId) ||
    !uuid ||
    !isAppAttestUuid(uuid) ||
    !keyId ||
    !isAppAttestKeyId(keyId)
  ) {
    return invalidRequest(
      'Invalid operation, operationId, uuid, or keyId for App Attest v2'
    )
  }

  const rawPurpose = optionalStringField(record, 'purpose', 64)
  const accountId = optionalStringField(record, 'accountId', 256)
  const contentHash = optionalStringField(record, 'contentHash', 64)
  const requestHash = optionalStringField(record, 'requestHash', 64)
  if (
    rawPurpose === null ||
    accountId === null ||
    (accountId !== undefined && !/^[A-Za-z0-9_-]{8,64}$/.test(accountId)) ||
    contentHash === null ||
    requestHash === null
  ) {
    return invalidRequest('Invalid App Attest assertion fields')
  }
  if (operation === 'assert') {
    if (
      !rawPurpose ||
      !isAppAttestAssertionPurpose(rawPurpose) ||
      !contentHash ||
      !/^[a-f0-9]{64}$/.test(contentHash) ||
      !requestHash ||
      !/^[a-f0-9]{64}$/.test(requestHash)
    ) {
      return invalidRequest('Invalid App Attest assertion binding')
    }
    return {
      protocolVersion: 2,
      operation,
      operationId,
      uuid,
      keyId,
      purpose: rawPurpose,
      accountId,
      contentHash,
      requestHash,
    }
  }
  if (
    rawPurpose != null ||
    accountId != null ||
    contentHash != null ||
    requestHash != null
  ) {
    return invalidRequest('Assertion fields are only valid for assertion challenges')
  }
  return { protocolVersion: 2, operation, operationId, uuid, keyId }
}

const parseRegistration = (
  input: unknown
): V1RegistrationRequest | V2RegistrationRequest => {
  const record = asRecord(input)
  if (!record) return invalidRequest('Invalid JSON body')

  if (protocolVersion(record) === 1) {
    const keyId = stringField(record, 'keyId', 256)
    const attestation = stringField(record, 'attestation')
    const challenge = stringField(record, 'challenge', 256)
    const uuid = stringField(record, 'uuid', 256)
    if (!keyId || !attestation || !challenge || !uuid) {
      return invalidRequest('Missing keyId, attestation, challenge, or uuid')
    }
    return {
      protocolVersion: 1,
      keyId,
      attestation,
      challenge,
      uuid,
    }
  }

  const challengeRequest = parseV2Challenge(record)
  if (challengeRequest.operation !== 'bind' && challengeRequest.operation !== 'enroll') {
    return invalidRequest('Registration operation must be bind or enroll')
  }
  const challenge = stringField(record, 'challenge', 64)
  const recoveryToken = stringField(record, 'recoveryToken', 64)
  if (!challenge || !isAppAttestChallenge(challenge) || !recoveryToken) {
    return invalidRequest('Invalid challenge or recoveryToken')
  }

  if (challengeRequest.operation === 'bind') {
    const attestation = stringField(record, 'attestation')
    if (!attestation) return invalidRequest('Missing attestation')
    return {
      ...challengeRequest,
      operation: 'bind',
      challenge,
      attestation,
      recoveryToken,
    }
  }

  const assertion = stringField(record, 'assertion', 65_536)
  if (!assertion) return invalidRequest('Missing assertion')
  return {
    ...challengeRequest,
    operation: 'enroll',
    challenge,
    assertion,
    recoveryToken,
  }
}

const parseAssertion = (
  input: unknown,
  binding: ProtectedAssertionBinding
): V1AssertionRequest | V2AssertionRequest => {
  const record = asRecord(input)
  if (!record) return invalidRequest('Invalid JSON body')

  const assertion = stringField(record, 'assertion', 65_536)
  const keyId = stringField(record, 'keyId', 256)
  const challenge = stringField(record, 'challenge', 256)
  const uuid = stringField(record, 'uuid', 256)
  if (!assertion || !keyId || !challenge || !uuid) {
    return invalidRequest('Missing uuid, keyId, challenge, or assertion')
  }
  if (
    uuid !== binding.uuid ||
    record.contentHash !== binding.contentHash ||
    (record.accountId ?? undefined) !== binding.accountId
  ) {
    return invalidRequest('App Attest signed fields do not match the request')
  }

  if (protocolVersion(record) === 1) {
    return {
      protocolVersion: 1,
      assertion,
      keyId,
      challenge,
      uuid,
      accountId: binding.accountId,
      contentHash: binding.contentHash,
    }
  }

  const challengeRequest = parseV2Challenge(record)
  if (
    challengeRequest.operation !== 'assert' ||
    challengeRequest.purpose !== binding.purpose ||
    challengeRequest.uuid !== binding.uuid ||
    challengeRequest.keyId !== keyId ||
    challengeRequest.accountId !== binding.accountId ||
    challengeRequest.contentHash !== binding.contentHash ||
    !binding.requestHash ||
    challengeRequest.requestHash !== binding.requestHash ||
    !isAppAttestChallenge(challenge) ||
    !/^[a-f0-9]{64}$/.test(binding.contentHash) ||
    !/^[a-f0-9]{64}$/.test(binding.requestHash)
  ) {
    return invalidRequest('Invalid App Attest v2 assertion binding')
  }

  return {
    ...challengeRequest,
    operation: 'assert',
    purpose: binding.purpose,
    challenge,
    assertion,
    accountId: binding.accountId,
    contentHash: binding.contentHash,
    requestHash: binding.requestHash,
  }
}

const unwrap = <T>(result: AppAttestDoResult<T>): T => {
  if (!result.ok) throw AppAttestError.fromFailure(result.error)
  return result.value
}

const storageUnavailable = (cause: unknown): AppAttestError =>
  new AppAttestError('App Attest storage is temporarily unavailable', {
    reason: 'storage_unavailable',
    action: 'retry',
    status: 503,
    cause,
  })

class DurableAppAttestLifecycle implements AppAttestLifecycle {
  readonly #environment: Environment

  constructor(environment: Environment) {
    this.#environment = environment
  }

  async issueChallenge(input?: unknown): Promise<AppAttestChallengeResponse> {
    const record = asRecord(input)
    if (input !== undefined && !record) return invalidRequest('Invalid JSON body')
    const version = protocolVersion(record)
    if (version === 1) {
      try {
        return { challenge: await issueLegacyChallenge(this.#environment.NOTES_KV) }
      } catch (error) {
        throw storageUnavailable(error)
      }
    }
    if (!record) return invalidRequest('Invalid JSON body')

    const request = parseV2Challenge(record)
    try {
      return unwrap(await this.#identity(request.uuid).issueChallenge(request))
    } catch (error) {
      if (error instanceof AppAttestError) throw error
      throw storageUnavailable(error)
    }
  }

  async register(input: unknown): Promise<AppAttestRegistrationResponse> {
    const request = parseRegistration(input)
    try {
      return unwrap(await this.#identity(request.uuid).register(request))
    } catch (error) {
      if (error instanceof AppAttestError) throw error
      throw storageUnavailable(error)
    }
  }

  async verifyAssertion(
    input: unknown,
    binding: ProtectedAssertionBinding
  ): Promise<AppAttestAssertionResponse> {
    const request = parseAssertion(input, binding)
    try {
      return unwrap(await this.#identity(request.uuid).verifyAssertion(request))
    } catch (error) {
      if (error instanceof AppAttestError) throw error
      throw storageUnavailable(error)
    }
  }

  #identity(uuid: string): IdentityStub {
    const id = this.#environment.APP_ATTEST_IDENTITY.idFromName(uuid)
    return this.#environment.APP_ATTEST_IDENTITY.get(id)
  }
}

export const appAttestLifecycle = (
  environment: Environment
): AppAttestLifecycle => new DurableAppAttestLifecycle(environment)
