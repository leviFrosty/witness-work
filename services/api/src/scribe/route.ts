import type { AppContext, Environment } from '../types'
import { Sentry } from '../sentry'
import {
  authenticateAccount,
  refuseInactiveAccount,
  type AccountAuth,
  type AccountAuthError,
} from '../accounts/auth'
import { BEARER_CHALLENGE } from '../buddies/errorResponse'
import {
  EDGE_RETRY_AFTER_SECONDS,
  allowBuddiesCaller,
  buddiesCallerKey,
} from '../buddies/limits'
import {
  analyticsDistinctId,
  analyticsEnabled,
  captureAnalyticsEvent,
  type AnalyticsEvent,
} from '../analytics'
import {
  resolveDevSession,
  resolveScribeConfig,
  withDevBypass,
  type DevSessionMetering,
  type ScribeConfig,
  type ScribeLimits,
} from './config'
import { computeUnits, retryAfterUntil, stepUsage } from './meter'
import { SCRIBE_SYSTEM_PROMPT } from './prompt'
import { hasUntrustedResults, isTurnTainted, offeredTools, renderModelInput } from './render'
import { SSE_HEADERS, createSseWriter } from './sse'
import { getPublicScribeStatus, resolveScribeAvailability } from './status'
import type { AdmitCallResult, AdmitStepResult, AdmitTranscribeResult } from './meterDO'
import { admitWithPlan, resolvePlan } from './plan'
import { cacheKeyFor, providerUserId, runScribeStep, type RawUsage } from './step'
import {
  TRANSCRIBE_ABORT_INPUT_ESTIMATE,
  TRANSCRIBE_MAX_BYTES,
  base64DecodedBytes,
  isTranscribeMimeType,
  matchesImageMagic,
  transcribePage,
} from './transcribe'
import {
  TERRITORY_NOTES_MAX_REQUEST_BYTES,
  TERRITORY_NOTES_TIMEOUT_MS,
  estimateNotesInputTokens,
  parseTerritoryNotesOutput,
  readTerritoryNotes,
  validateTerritoryNotesRequest,
} from './territoryNotes'
import {
  ULID,
  estimateInputTokens,
  readBodyText,
  validateStepRequest,
} from './validate'
import { scribeError, toScribeModelError, devDetail, type ScribeErrorOptions } from './errors'
import {
  scribeStepEvent,
  scribeStepLogLine,
  scribeTerritoryNotesEvent,
  scribeTerritoryNotesLogLine,
  scribeTranscribeEvent,
  scribeTranscribeLogLine,
  turnGap,
  type ScribePlatform,
  type StepLogFields,
  type TerritoryNotesLogFields,
  type TranscribeLogFields,
} from './analytics'
import {
  SCRIBE_PROTOCOL_MAX,
  type ScribeErrorCode,
  type ScribePlan,
  type UsageSnapshot,
} from './wire'

/**
 * `/scribe/v1/*` (witness-work `docs/scribe-ai-protocol.md`): the public
 * status, the account's usage, one model step over SSE, and Import from
 * Paper's page reader. Every user-scoped route takes the account session's
 * bearer token (ADR 0027) and meters by its account in the `ScribeMeter`
 * Durable Object. ww-api stores no conversation content at any point.
 */

/** The kill switch and provider health are read through 60-second caches. */
const SWITCH_RETRY_AFTER_SECONDS = 60
const ACTIVE_CAP_RETRY_AFTER_SECONDS = 5
const UPGRADE_REQUIRED = 426

const waitUntilOf = (ctx: AppContext): ((promise: Promise<unknown>) => void) | undefined => {
  try {
    const executionCtx = ctx.executionCtx
    if (!executionCtx) return undefined
    return (promise) => executionCtx.waitUntil(promise)
  } catch {
    return undefined
  }
}

const track = (ctx: AppContext, event: AnalyticsEvent) => {
  if (!analyticsEnabled(ctx.env)) return
  const delivery = captureAnalyticsEvent(ctx.env, event)
  waitUntilOf(ctx)?.(delivery)
}

const meterFor = (env: Environment, accountId: string) =>
  env.SCRIBE_METER.get(env.SCRIBE_METER.idFromName(accountId))

/** An account refusal in Scribe AI's envelope. */
const authRefusal = (error: AccountAuthError): Response => {
  switch (error) {
    case 'unauthorized':
      return scribeError(401, 'unauthorized', {
        headers: { 'WWW-Authenticate': BEARER_CHALLENGE },
      })
    case 'suspended':
      return scribeError(403, 'suspended')
    case 'disabled':
      // No token secret or no accounts database on this worker.
      return scribeError(503, 'unavailable', { retryAfter: SWITCH_RETRY_AFTER_SECONDS })
    case 'internal':
      return scribeError(500, 'server_error')
  }
}

const readEdgeAllowed = (ctx: AppContext) =>
  allowBuddiesCaller(ctx.env, 'inbox/sync', buddiesCallerKey(ctx.req.header('CF-Connecting-IP')))

const platformOf = (account: AccountAuth): ScribePlatform => account.platform

/**
 * The limits a session is metered under: a dev session's are unlimited unless
 * `scribe:dev-session` keeps the real ones. Request caps always apply.
 */
const meteredLimits = (limits: ScribeLimits, dev: DevSessionMetering | null): ScribeLimits =>
  withDevBypass(limits, dev != null && !dev.realLimits)

const parseJson = (text: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

type ProtocolCheck = { ok: true; protocol: number } | { ok: false; status: number; code: ScribeErrorCode; rule: string }

/** `protocol < min` → 426; `> max` → 400 (protocol: Versioning). */
const checkProtocol = (value: unknown, config: ScribeConfig): ProtocolCheck => {
  if (!Number.isInteger(value)) return { ok: false, status: 400, code: 'bad_request', rule: 'protocol' }
  const protocol = value as number
  if (protocol < config.protocolMin)
    return { ok: false, status: UPGRADE_REQUIRED, code: 'upgrade_required', rule: 'protocol_min' }
  if (protocol > SCRIBE_PROTOCOL_MAX)
    return { ok: false, status: 400, code: 'bad_request', rule: 'protocol_max' }
  return { ok: true, protocol }
}

// --- GET /scribe/v1/status ----------------------------------------------------

/** Public, no auth; the same answer for everyone, reused per isolate for 30 s. */
export async function handleScribeStatusRequest(ctx: AppContext) {
  if (!(await readEdgeAllowed(ctx)))
    return scribeError(429, 'rate_limited', { retryAfter: EDGE_RETRY_AFTER_SECONDS })
  const status = await getPublicScribeStatus(ctx.env, waitUntilOf(ctx))
  return ctx.json(status, 200, { 'Cache-Control': 'no-store' })
}

// --- GET /scribe/v1/usage -----------------------------------------------------

/**
 * The account's usage windows. Read-only: never charges or starts a window.
 * A suspended account can still read it.
 */
export async function handleScribeUsageRequest(ctx: AppContext) {
  if (!(await readEdgeAllowed(ctx)))
    return scribeError(429, 'rate_limited', { retryAfter: EDGE_RETRY_AFTER_SECONDS })
  const auth = await authenticateAccount(ctx)
  if (!auth.ok) return authRefusal(auth.error)
  const { account } = auth
  const inactive = await refuseInactiveAccount(ctx.env, account)
  if (inactive && inactive.error !== 'suspended') return authRefusal(inactive.error)

  const [config, dev] = await Promise.all([
    resolveScribeConfig(ctx.env),
    resolveDevSession(ctx.env, account),
  ])
  // Always asked afresh (and cached for steps): the app reads usage after a
  // purchase or Check again.
  const { plan, supporterCheckFailed } = await resolvePlan(ctx.env, account, dev)
  const snapshot = await meterFor(ctx.env, account.accountId).usage({
    plan,
    supporterCheckFailed,
    limits: meteredLimits(config.limits, dev),
    now: Date.now(),
  })
  return ctx.json({ ok: true as const, ...snapshot }, 200, { 'Cache-Control': 'no-store' })
}

// --- POST /scribe/v1/step -----------------------------------------------------

const emptyStepLog = (account: AccountAuth): StepLogFields => ({
  protocol: null,
  step: null,
  plan: null,
  platform: platformOf(account),
  appVersion: null,
  conversationId: null,
  turnId: null,
  offered: [],
  dropped: [],
  toolCalls: [],
  unknownToolCalls: 0,
  invalidArgsCalls: 0,
  finish: null,
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  units: 0,
  usageEstimated: false,
  costUsd: null,
  turnGap: null,
  model: null,
  provider: null,
  latencyMs: 0,
  ttftMs: null,
  tainted: false,
  grace: false,
  retriedWithoutReasoning: false,
  injectionBlock: null,
  rule: null,
  errorCode: null,
})

const recordUsage = (log: StepLogFields, usage: RawUsage | null, units: number) => {
  if (!usage) return
  log.inputTokens = usage.inputTokens
  log.cachedInputTokens = usage.cachedInputTokens
  log.cacheWriteTokens = usage.cacheWriteTokens
  log.outputTokens = usage.outputTokens
  log.reasoningTokens = usage.reasoningTokens
  log.usageEstimated = usage.estimated
  log.costUsd = usage.costUsd
  log.units = units
}

/**
 * One model step. Pre-flight in the protocol's order (Enforcement): per-IP
 * rate limit (middleware) → auth → kill switch and provider → `protocol` →
 * body and tool validation → context estimate → meter (with turn grace),
 * step key, active-step cap → model. Refusals before admission are JSON
 * errors; `start` is written only once the step is admitted, and the stream
 * then ends with exactly one `done` or `error`. The plan is resolved alongside
 * the body read and validation (it's needed only at admission).
 */
export async function handleScribeStepRequest(ctx: AppContext) {
  const startedAt = Date.now()
  const auth = await authenticateAccount(ctx, { requireActive: true })
  if (!auth.ok) return authRefusal(auth.error)
  const { account } = auth
  const dev = await resolveDevSession(ctx.env, account)
  const devBypass = dev != null
  // Never rejects; left unread when the request is refused first.
  const planning = resolvePlan(ctx.env, account, dev, { useCache: true })
  const distinctId = await analyticsDistinctId(account.accountId)
  const log = emptyStepLog(account)
  const emit = () => {
    log.latencyMs = Date.now() - startedAt
    console.info(scribeStepLogLine(log))
    track(ctx, scribeStepEvent(distinctId, log))
  }
  const refuse = (
    status: number,
    code: ScribeErrorCode,
    options: ScribeErrorOptions = {},
    rule: string | null = null
  ) => {
    log.errorCode = code
    log.rule = rule
    emit()
    return scribeError(status, code, options)
  }

  const availability = await resolveScribeAvailability({ env: ctx.env, waitUntil: waitUntilOf(ctx) })
  if (!availability.enabled || !availability.target) {
    return availability.reason === 'disabled'
      ? refuse(503, 'disabled', { retryAfter: SWITCH_RETRY_AFTER_SECONDS })
      : refuse(503, 'unavailable', {
          retryAfter: SWITCH_RETRY_AFTER_SECONDS,
          detail: devBypass ? (availability.reason ?? undefined) : undefined,
        })
  }
  const { config, target } = availability
  const limits = meteredLimits(config.limits, dev)
  log.model = target.model

  const read = await readBodyText(ctx.req.raw, limits.maxRequestBytes)
  if (!read.ok)
    return read.tooLarge
      ? refuse(413, 'too_large', {}, 'request_bytes')
      : refuse(400, 'bad_request', {}, 'body')
  const body = parseJson(read.text)
  if (!body) return refuse(400, 'bad_request', {}, 'json')
  const protocol = checkProtocol(body.protocol, config)
  if (!protocol.ok) return refuse(protocol.status, protocol.code, {}, protocol.rule)
  log.protocol = protocol.protocol
  if (Number.isInteger(body.step)) log.step = body.step as number
  if (typeof body.conversationId === 'string' && ULID.test(body.conversationId))
    log.conversationId = body.conversationId
  if (typeof body.turnId === 'string' && ULID.test(body.turnId)) log.turnId = body.turnId

  const validated = validateStepRequest(body, limits)
  if (!validated.ok) return refuse(validated.status, validated.code, {}, validated.rule)
  const request = validated.value
  log.appVersion = request.app.version

  log.turnGap = turnGap(request.messages, request.step)
  const tainted = isTurnTainted(request.messages)
  const { offered, dropped } = offeredTools(request.tools, config.disabledTools, tainted)
  log.tainted = tainted
  log.offered = offered.map((tool) => tool.name)
  log.dropped = dropped

  const inputEstimate = estimateInputTokens(SCRIBE_SYSTEM_PROMPT, request)
  if (inputEstimate > limits.maxInputTokens)
    return refuse(413, 'context_full', {}, 'context_estimate')

  const meter = meterFor(ctx.env, account.accountId)
  const { plan: resolved, result: admitted } = await admitWithPlan<AdmitStepResult>(
    planning,
    () => resolvePlan(ctx.env, account, dev),
    ({ plan, supporterCheckFailed }) =>
      meter.admitStep({
        plan,
        supporterCheckFailed,
        limits,
        turnId: request.turnId,
        step: request.step,
        now: Date.now(),
      }),
    (result) => !result.ok && result.code === 'limit_reached'
  )
  log.plan = resolved.plan
  const context = {
    plan: resolved.plan,
    supporterCheckFailed: resolved.supporterCheckFailed,
    limits,
  }
  if (!admitted.ok) {
    switch (admitted.code) {
      case 'limit_reached':
        return refuse(402, 'limit_reached', {
          usage: admitted.snapshot,
          retryAfter: retryAfterUntil(admitted.snapshot.resetsAt, Date.now()),
        })
      case 'step_in_progress':
      case 'step_retry_limit':
        return refuse(409, admitted.code)
      case 'active_cap':
        return refuse(429, 'active_cap', { retryAfter: ACTIVE_CAP_RETRY_AFTER_SECONDS })
    }
  }
  log.grace = admitted.grace

  const clientGone = new AbortController()
  const writer = createSseWriter({ onClosed: () => clientGone.abort() })
  ctx.req.raw.signal?.addEventListener('abort', () => clientGone.abort(), { once: true })

  const work = (async () => {
    let settled = false
    const settle = (units: number) =>
      meter.settleStep({
        ...context,
        turnId: request.turnId,
        step: request.step,
        units,
        now: Date.now(),
      })
    try {
      await writer.send({
        type: 'start',
        offered: offered.map((tool) => tool.name),
        dropped,
      })
      writer.startHeartbeat()
      const lastStep = request.step === limits.maxStepsPerTurn - 1
      const outcome = await runScribeStep({
        apiKey: ctx.env.OPENROUTER_API_KEY,
        user: await providerUserId(account.accountId),
        target,
        model: config.model,
        input: renderModelInput(SCRIBE_SYSTEM_PROMPT, request.context, request.messages),
        withheldInput: hasUntrustedResults(request.messages)
          ? renderModelInput(SCRIBE_SYSTEM_PROMPT, request.context, request.messages, {
              withholdUntrusted: true,
            })
          : undefined,
        tools: offered,
        toolChoice: lastStep ? 'none' : 'auto',
        inputEstimate,
        cacheKey: cacheKeyFor(account.accountId, config.model.cacheKeyBuckets),
        stepTimeoutMs: limits.stepTimeoutMs,
        signal: clientGone.signal,
        callbacks: {
          onText: (delta) => writer.send({ type: 'text', delta }),
          onToolCall: (call) => writer.send({ type: 'tool_call', ...call }),
        },
      })
      const units = outcome.usage ? computeUnits(outcome.usage, limits.weights) : 0
      // Settled before `done`, never after: the device sends the next step as
      // soon as it reads `done`, from another request the Durable Object
      // doesn't order after this settle, and that admission must see this
      // charge. A failed settle then ends as `server_error`, which the device
      // doesn't act on, instead of an answered step left uncharged.
      const meterSnapshot: UsageSnapshot = await settle(units)
      settled = true
      log.toolCalls = outcome.counts.emitted
      log.unknownToolCalls = outcome.counts.unknownTool
      log.invalidArgsCalls = outcome.counts.invalidArgs
      log.provider = outcome.resolvedProvider
      log.ttftMs = outcome.ttftMs
      recordUsage(log, outcome.usage, units)
      // Dropped calls are counted, never shown: the name may not be ours.
      if (outcome.counts.unknownTool) console.warn(`scribe step: unknown_tool x${outcome.counts.unknownTool}`)
      if (outcome.counts.invalidArgs)
        console.warn(`scribe step: invalid_args_json x${outcome.counts.invalidArgs}`)

      switch (outcome.kind) {
        case 'finished':
          log.finish = outcome.finish
          log.retriedWithoutReasoning = outcome.retriedWithoutReasoning
          log.injectionBlock = outcome.injectionBlock
          await writer.send({
            type: 'done',
            finish: outcome.finish,
            usage: stepUsage(outcome.usage, limits.weights),
            meter: meterSnapshot,
          })
          break
        case 'aborted':
          // A Cancel or dropped connection has no one left to tell.
          log.errorCode = outcome.reason === 'timeout' ? 'model_timeout' : 'cancelled'
          if (outcome.reason === 'timeout')
            await writer.send({
              type: 'error',
              code: 'model_timeout',
              message: 'The model took too long',
              retryable: true,
              meter: meterSnapshot,
            })
          break
        case 'failed':
          log.errorCode = 'model_error'
          Sentry.captureException(toScribeModelError(outcome.error))
          await writer.send({
            type: 'error',
            code: 'model_error',
            message: 'The model could not answer',
            retryable: true,
            ...(units > 0 ? { meter: meterSnapshot } : {}),
          })
          break
      }
    } catch (error) {
      log.errorCode = 'server_error'
      // Our own failure (the meter, the stream); report its class only.
      Sentry.captureException(toScribeModelError(error))
      if (!settled) await settle(0).catch(() => undefined)
      await writer.send({
        type: 'error',
        code: 'server_error',
        message: 'Unexpected error',
        retryable: true,
      })
    } finally {
      await writer.close()
      emit()
    }
  })()
  waitUntilOf(ctx)?.(work)
  return new Response(writer.readable, { status: 200, headers: SSE_HEADERS })
}

// --- POST /scribe/v1/transcribe -----------------------------------------------

/** A body holding a 4 MiB image as base64, plus the JSON around it. */
const TRANSCRIBE_MAX_REQUEST_BYTES = Math.ceil((TRANSCRIBE_MAX_BYTES * 4) / 3) + 4_096

const pageLimitFor = (limits: ScribeLimits, plan: ScribePlan) =>
  plan === 'supporter' ? limits.transcribePagesPerDay.supporter : limits.transcribePagesPerDay.free

/**
 * Reads one paper page into text (ADR 0025), metered like a step: the same
 * enforcement (402), then the rolling-day page ceiling (429
 * `transcribe_limit`; the page counts before the model runs), then the
 * vision call, charged from its usage.
 */
export async function handleScribeTranscribeRequest(ctx: AppContext) {
  const startedAt = Date.now()
  const auth = await authenticateAccount(ctx, { requireActive: true })
  if (!auth.ok) return authRefusal(auth.error)
  const { account } = auth
  const dev = await resolveDevSession(ctx.env, account)
  const devBypass = dev != null
  // Never rejects; left unread when the request is refused first.
  const planning = resolvePlan(ctx.env, account, dev, { useCache: true })
  const distinctId = await analyticsDistinctId(account.accountId)
  const log: TranscribeLogFields = {
    plan: null,
    platform: platformOf(account),
    mimeType: null,
    bytes: null,
    textChars: 0,
    truncated: false,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    units: 0,
    costUsd: null,
    model: null,
    provider: null,
    latencyMs: 0,
    errorCode: null,
  }
  const emit = () => {
    log.latencyMs = Date.now() - startedAt
    console.info(scribeTranscribeLogLine(log))
    track(ctx, scribeTranscribeEvent(distinctId, log))
  }
  const refuse = (status: number, code: ScribeErrorCode, options: ScribeErrorOptions = {}) => {
    log.errorCode = code
    emit()
    return scribeError(status, code, options)
  }

  const availability = await resolveScribeAvailability({ env: ctx.env, waitUntil: waitUntilOf(ctx) })
  if (!availability.enabled) {
    return availability.reason === 'disabled'
      ? refuse(503, 'disabled', { retryAfter: SWITCH_RETRY_AFTER_SECONDS })
      : refuse(503, 'unavailable', { retryAfter: SWITCH_RETRY_AFTER_SECONDS })
  }
  const { config } = availability
  const limits = meteredLimits(config.limits, dev)

  const read = await readBodyText(ctx.req.raw, TRANSCRIBE_MAX_REQUEST_BYTES)
  if (!read.ok) return read.tooLarge ? refuse(413, 'too_large') : refuse(400, 'bad_request')
  const body = parseJson(read.text)
  if (!body) return refuse(400, 'bad_request')
  const protocol = checkProtocol(body.protocol, config)
  if (!protocol.ok) return refuse(protocol.status, protocol.code)
  const { image, mimeType } = body
  if (typeof image !== 'string' || !isTranscribeMimeType(mimeType)) return refuse(400, 'bad_request')
  log.mimeType = mimeType
  const bytes = base64DecodedBytes(image)
  if (bytes == null || !matchesImageMagic(image, mimeType)) return refuse(400, 'bad_request')
  log.bytes = bytes
  if (bytes > TRANSCRIBE_MAX_BYTES) return refuse(413, 'too_large')

  const meter = meterFor(ctx.env, account.accountId)
  const { plan: resolved, result: admitted } = await admitWithPlan<AdmitTranscribeResult>(
    planning,
    () => resolvePlan(ctx.env, account, dev),
    ({ plan, supporterCheckFailed }) =>
      meter.admitTranscribe({
        plan,
        supporterCheckFailed,
        limits,
        pageLimit: pageLimitFor(limits, plan),
        now: Date.now(),
      }),
    (result) => !result.ok
  )
  log.plan = resolved.plan
  const context = {
    plan: resolved.plan,
    supporterCheckFailed: resolved.supporterCheckFailed,
    limits,
  }
  if (!admitted.ok) {
    if (admitted.code === 'limit_reached')
      return refuse(402, 'limit_reached', {
        usage: admitted.snapshot,
        retryAfter: retryAfterUntil(admitted.snapshot.resetsAt, Date.now()),
      })
    return refuse(429, 'transcribe_limit', {
      retryAfter: Math.max(1, Math.ceil(admitted.retryAfterMs / 1000)),
    })
  }

  const target = { model: config.model.transcribeModel, providers: config.model.providers }
  log.model = target.model
  let output
  try {
    output = await transcribePage({
      apiKey: ctx.env.OPENROUTER_API_KEY,
      user: await providerUserId(account.accountId),
      target,
      image,
      mimeType,
      abortSignal: ctx.req.raw.signal,
    })
  } catch (error) {
    if (ctx.req.raw.signal?.aborted) {
      // The client left mid-call: charge the estimate (protocol: Metering).
      const units = computeUnits(
        {
          inputTokens: TRANSCRIBE_ABORT_INPUT_ESTIMATE,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 0,
        },
        limits.weights
      )
      await meter.charge({ ...context, units, kind: 'transcribe', now: Date.now() })
      log.units = units
      return refuse(502, 'model_error')
    }
    Sentry.captureException(toScribeModelError(error))
    return refuse(502, 'model_error', { detail: devBypass ? devDetail(error) : undefined })
  }

  const usage = {
    inputTokens: output.usage.inputTokens ?? 0,
    cachedInputTokens: output.usage.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: output.usage.inputTokenDetails?.cacheWriteTokens ?? 0,
    outputTokens: output.usage.outputTokens ?? 0,
  }
  const units = computeUnits(usage, limits.weights)
  const snapshot = await meter.charge({ ...context, units, kind: 'transcribe', now: Date.now() })
  const truncated = output.finishReason === 'length'
  Object.assign(log, usage, {
    units,
    costUsd: output.costUsd ?? null,
    provider: output.resolvedProvider ?? null,
    textChars: output.text.length,
    truncated,
  })
  emit()
  return ctx.json({ ok: true as const, text: output.text, truncated, usage: snapshot })
}

// --- POST /scribe/v1/territory-notes ---------------------------------------------

/**
 * Reads a publisher's territory notes into door results for the app's review
 * step. Pre-flight like a page: auth → kill switch and provider → `protocol`
 * → body → usage windows (402); then one model call, charged from its usage
 * (an abort or timeout is charged as the input estimate). A malformed answer
 * is charged and answered 502 `model_error` with `usage`, so the app falls
 * back to its own reader. The notes are never logged or stored.
 */
export async function handleScribeTerritoryNotesRequest(ctx: AppContext) {
  const startedAt = Date.now()
  const auth = await authenticateAccount(ctx, { requireActive: true })
  if (!auth.ok) return authRefusal(auth.error)
  const { account } = auth
  const dev = await resolveDevSession(ctx.env, account)
  const devBypass = dev != null
  // Never rejects; left unread when the request is refused first.
  const planning = resolvePlan(ctx.env, account, dev, { useCache: true })
  const distinctId = await analyticsDistinctId(account.accountId)
  const log: TerritoryNotesLogFields = {
    plan: null,
    platform: platformOf(account),
    lines: 0,
    notesChars: 0,
    streets: 0,
    doors: 0,
    ranges: 0,
    unread: 0,
    dropped: 0,
    malformed: false,
    truncated: false,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    units: 0,
    usageEstimated: false,
    costUsd: null,
    model: null,
    provider: null,
    latencyMs: 0,
    rule: null,
    errorCode: null,
  }
  const emit = () => {
    log.latencyMs = Date.now() - startedAt
    console.info(scribeTerritoryNotesLogLine(log))
    track(ctx, scribeTerritoryNotesEvent(distinctId, log))
  }
  const refuse = (
    status: number,
    code: ScribeErrorCode,
    options: ScribeErrorOptions = {},
    rule: string | null = null
  ) => {
    log.errorCode = code
    log.rule = rule
    emit()
    return scribeError(status, code, options)
  }

  const availability = await resolveScribeAvailability({ env: ctx.env, waitUntil: waitUntilOf(ctx) })
  if (!availability.enabled || !availability.target) {
    return availability.reason === 'disabled'
      ? refuse(503, 'disabled', { retryAfter: SWITCH_RETRY_AFTER_SECONDS })
      : refuse(503, 'unavailable', { retryAfter: SWITCH_RETRY_AFTER_SECONDS })
  }
  const { config, target } = availability
  const limits = meteredLimits(config.limits, dev)
  log.model = target.model

  const read = await readBodyText(ctx.req.raw, TERRITORY_NOTES_MAX_REQUEST_BYTES)
  if (!read.ok)
    return read.tooLarge
      ? refuse(413, 'too_large', {}, 'request_bytes')
      : refuse(400, 'bad_request', {}, 'body')
  const body = parseJson(read.text)
  if (!body) return refuse(400, 'bad_request', {}, 'json')
  const protocol = checkProtocol(body.protocol, config)
  if (!protocol.ok) return refuse(protocol.status, protocol.code, {}, protocol.rule)
  const validated = validateTerritoryNotesRequest(body)
  if (!validated.ok) return refuse(validated.status, validated.code, {}, validated.rule)
  const request = validated.value
  log.lines = request.lines.filter((line) => line.trim()).length
  log.notesChars = request.lines.join('\n').length
  log.streets = request.streets.length

  const meter = meterFor(ctx.env, account.accountId)
  const { plan: resolved, result: admitted } = await admitWithPlan<AdmitCallResult>(
    planning,
    () => resolvePlan(ctx.env, account, dev),
    ({ plan, supporterCheckFailed }) =>
      meter.admitCall({ plan, supporterCheckFailed, limits, now: Date.now() }),
    (result) => !result.ok
  )
  log.plan = resolved.plan
  const context = {
    plan: resolved.plan,
    supporterCheckFailed: resolved.supporterCheckFailed,
    limits,
  }
  if (!admitted.ok)
    return refuse(402, 'limit_reached', {
      usage: admitted.snapshot,
      retryAfter: retryAfterUntil(admitted.snapshot.resetsAt, Date.now()),
    })

  const timeout = AbortSignal.timeout(TERRITORY_NOTES_TIMEOUT_MS)
  const signal = ctx.req.raw.signal ? AbortSignal.any([ctx.req.raw.signal, timeout]) : timeout
  let output
  try {
    output = await readTerritoryNotes({
      apiKey: ctx.env.OPENROUTER_API_KEY,
      user: await providerUserId(account.accountId),
      target,
      request,
      abortSignal: signal,
    })
  } catch (error) {
    if (signal.aborted) {
      // No reported usage: charge the input estimate (protocol: Metering).
      const units = computeUnits(
        {
          inputTokens: estimateNotesInputTokens(request),
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 0,
        },
        limits.weights
      )
      const usage = await meter.charge({ ...context, units, kind: 'territory_notes', now: Date.now() })
      log.units = units
      log.usageEstimated = true
      return refuse(502, 'model_error', { usage }, timeout.aborted ? 'timeout' : 'cancelled')
    }
    Sentry.captureException(toScribeModelError(error))
    return refuse(502, 'model_error', { detail: devBypass ? devDetail(error) : undefined })
  }

  const usage = {
    inputTokens: output.usage.inputTokens ?? 0,
    cachedInputTokens: output.usage.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: output.usage.inputTokenDetails?.cacheWriteTokens ?? 0,
    outputTokens: output.usage.outputTokens ?? 0,
  }
  const units = computeUnits(usage, limits.weights)
  const snapshot = await meter.charge({ ...context, units, kind: 'territory_notes', now: Date.now() })
  Object.assign(log, usage, {
    units,
    costUsd: output.costUsd ?? null,
    provider: output.resolvedProvider ?? null,
    truncated: output.finishReason === 'length',
  })
  const result = parseTerritoryNotesOutput(output.text, request)
  if (!result) {
    log.malformed = true
    return refuse(502, 'model_error', { usage: snapshot }, 'malformed_output')
  }
  Object.assign(log, {
    doors: result.doors.length,
    ranges: result.ranges.length,
    unread: result.unread.length,
    dropped: result.dropped,
  })
  emit()
  return ctx.json({
    ok: true as const,
    doors: result.doors,
    ranges: result.ranges,
    unread: result.unread,
    usage: snapshot,
  })
}
