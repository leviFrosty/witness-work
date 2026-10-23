import type {
  ScribeActivityArea,
  ScribeEntryPoint,
  ScribeErrorCode,
  ScribeInputSource,
  ScribeNotice,
  ScribeRun,
  ScribeTimelineItem,
} from '@/features/scribe/types'
import {
  SCRIBE_PROTOCOL,
  type ProposalOutcomeBlock,
  type ScribeLimitsWire,
  type StepRequest,
  type ToolCallBlock,
  type UserMessage,
  type WireMessage,
} from '@/features/scribe/lib/wire'
import type { ScribeClient } from '@/features/scribe/lib/scribeClient'
import {
  REPORTED_SERVER_CODES,
  ScribeClientError,
  fromStreamErrorCode,
  toScribeClientError,
  toScribeError,
} from '@/features/scribe/lib/errors'
import { fullWindow } from '@/features/scribe/lib/usageSnapshot'
import { RefRegistry } from '@/features/scribe/runtime/refs'
import {
  buildScribeContext,
  localDayKey,
  type ScribeStores,
} from '@/features/scribe/runtime/snapshot'
import { toolDefinitions } from '@/features/scribe/runtime/wireTools'
import {
  startToolCalls,
  type ToolRunOutcome,
} from '@/features/scribe/runtime/toolRunner'
import { budgetState, jsonBytes } from '@/features/scribe/runtime/budget'
import {
  awaitConnection,
  beginTurnSignal,
  endTurnSignal,
  forgoResume,
  setDrafting,
  setRun,
  setStreaming,
  startTurnDebug,
  takeAwaitingConnection,
  updateTurnDebug,
  useScribeRuns,
} from '@/features/scribe/runtime/runs'
import type { ScribeTool } from '@/features/scribe/tools/types'
import { TurnDraft } from '@/features/scribe/proposals/draft'
import { buildCards, mergeCards } from '@/features/scribe/proposals/cards'
import { outcomeBlock } from '@/features/scribe/proposals/apply'
import type { StoredProposal } from '@/features/scribe/proposals/model'
import {
  getConversation,
  markFinishedTurn,
  newConversation,
  putConversation,
  type StoredConversation,
  type SuspendedTurn,
  type TurnStats,
} from '@/features/scribe/stores/conversations'
import { noteUsage } from '@/features/scribe/stores/usage'
import {
  setScribeMemoryText,
  useScribeMemory,
} from '@/features/scribe/stores/memory'
import { replayMemoryEdits } from '@/features/scribe/lib/memory'
import {
  trackContextFull,
  trackLimitReached,
  trackMemorySaved,
  trackProposalResolved,
  trackTurnFinished,
  trackTurnStarted,
  type TurnOutcome,
} from '@/features/scribe/analytics'

/** What a turn needs from the app; tests pass fakes. */
export interface ScribeRuntimeDeps {
  client: () => ScribeClient
  stores: () => ScribeStores
  now: () => Date
  ulid: () => string
  app: () => StepRequest['app']
  tz: () => string
  limits: () => ScribeLimitsWire
  tools: readonly ScribeTool[]
  tool: (name: string) => ScribeTool | null
  /** A failure worth knowing about (an app bug, a device gate). */
  onFailure?: (failure: ScribeClientError) => void
  readTimeoutMs?: number
}

export interface SendInput {
  text: string
  source: ScribeInputSource
  entry: ScribeEntryPoint
}

const EMPTY_STATS = (): TurnStats => ({
  steps: 0,
  readCalls: 0,
  writeCalls: 0,
  invalidCalls: 0,
  failedWrites: {},
  tainted: false,
})

/**
 * A kept step's memory edits, saved in the background. When the User edited the
 * memory in Settings while the step ran, the edits apply again to theirs. The
 * conversation's pinned context keeps the memory it started with; the model
 * sees its edits in the transcript.
 */
function saveMemoryEdits(before: string, outcome: ToolRunOutcome): void {
  const { text } = useScribeMemory.getState()
  const saved =
    text === before
      ? { text: outcome.memoryText, changes: outcome.memoryChanges }
      : replayMemoryEdits(text, outcome.memoryEdits)
  if (saved.text !== text) setScribeMemoryText(saved.text)
  if (saved.changes.length) trackMemorySaved(saved.changes, saved.text.length)
}

/** The latest outcome per Proposal, oldest Proposal first. */
function collapseOutcomes(
  outcomes: readonly ProposalOutcomeBlock[]
): ProposalOutcomeBlock[] {
  const latest = new Map<string, ProposalOutcomeBlock>()
  for (const outcome of outcomes) {
    latest.delete(outcome.proposalId)
    latest.set(outcome.proposalId, outcome)
  }
  return [...latest.values()]
}

const isoAt = (date: Date) => {
  // Local ISO with offset, as the context's `now`.
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(offset / 60)}:${pad(offset % 60)}`
}

/**
 * Pins the context, or rebuilds it when the local day changed (Refs kept).
 * Mid-turn, `registry` is the turn's, so Refs the rebuild issues stay in it.
 */
function withCurrentContext(
  conversation: StoredConversation,
  deps: ScribeRuntimeDeps,
  registry?: RefRegistry
): StoredConversation {
  const now = deps.now()
  const today = localDayKey(now)
  if (conversation.context && conversation.contextDay === today)
    return conversation
  const refs = registry ?? new RefRegistry(structuredClone(conversation.refs))
  const context = buildScribeContext(deps.stores(), refs, {
    now,
    locale: deps.app().locale,
    tz: deps.tz(),
  })
  return {
    ...conversation,
    context,
    contextDay: today,
    refs: structuredClone(refs.table),
  }
}

/** Budget for a conversation as stored. */
export function conversationBudget(
  conversation: StoredConversation,
  deps: Pick<ScribeRuntimeDeps, 'tools' | 'limits'>,
  pendingBytes = 0
) {
  return budgetState({
    lastInputTokens: conversation.lastInputTokens,
    messagesAtLastStep: conversation.messagesAtLastStep,
    messages: conversation.messages,
    context: conversation.context,
    tools: toolDefinitions(deps.tools),
    maxInputTokens: deps.limits().maxInputTokens,
    contextFull: conversation.contextFull,
    pendingBytes,
  })
}

/** Notes the budget for analytics, once per conversation per state. */
function noticeBudget(
  conversation: StoredConversation,
  deps: ScribeRuntimeDeps
): StoredConversation {
  const state = conversationBudget(conversation, deps)
  if (state === 'nearFull' && !conversation.contextNoticed.nearFull) {
    trackContextFull('near_full')
    return {
      ...conversation,
      contextNoticed: { ...conversation.contextNoticed, nearFull: true },
    }
  }
  if (state === 'full' && !conversation.contextNoticed.full) {
    trackContextFull('full')
    return {
      ...conversation,
      contextNoticed: { ...conversation.contextNoticed, full: true },
    }
  }
  return conversation
}

/**
 * The last turn, when the model never answered it and it left nothing to
 * review: it failed or was stopped before a step came back, or failed partway
 * without cards. `index` is its user message.
 */
function unansweredTurn(
  conversation: StoredConversation
): { index: number; outcomes: ProposalOutcomeBlock[] } | null {
  const { messages, suspended } = conversation
  const index = messages.findLastIndex((message) => message.role === 'user')
  if (index < 0) return null
  const unanswered =
    index === messages.length - 1 ||
    (suspended !== null && suspended.proposalId === null)
  if (!unanswered) return null
  const message = messages[index] as UserMessage
  return {
    index,
    outcomes: message.content.filter(
      (block): block is ProposalOutcomeBlock =>
        block.type === 'proposal_outcome'
    ),
  }
}

function resolveSuperseded(proposal: StoredProposal): void {
  trackProposalResolved({
    outcome: 'superseded',
    cards: proposal.cards.length,
    appliedCards: 0,
    deselectedCards: proposal.cards.filter((card) => !card.selected).length,
    choiceCards: proposal.cards.filter(
      (card) => card.contact?.type === 'choice'
    ).length,
    kinds: proposal.effects.map((effect) => effect.draft.kind),
    tainted: proposal.tainted,
  })
}

/**
 * Sends a user message and runs the turn (protocol: What the app does with a
 * step). Starts the conversation when `conversationId` is null, and resolves
 * with its id once the turn ends. A pending Proposal is withdrawn
 * (`superseded`) first, and a turn that ended unanswered gives way to this
 * message.
 */
export async function sendScribeMessage(
  deps: ScribeRuntimeDeps,
  conversationId: string | null,
  input: SendInput
): Promise<string> {
  const text = input.text.trim()
  const now = deps.now()
  const id = conversationId ?? deps.ulid()
  let conversation =
    getConversation(id) ?? newConversation(id, now.getTime(), text)
  if (!text) return id
  forgoResume()
  const signal = beginTurnSignal(id)
  if (!signal) return id
  try {
    conversation = withCurrentContext(conversation, deps)
    const turnId = deps.ulid()
    const at = now.getTime()

    // The model never answered the last turn: this message replaces it, so the
    // model can't act on both. What it reported goes with this one.
    const replaced = unansweredTurn(conversation)
    const outcomes = [...(replaced?.outcomes ?? []), ...conversation.outcomes]
    if (replaced)
      conversation = {
        ...conversation,
        messages: conversation.messages.slice(0, replaced.index),
        messagesAtLastStep: Math.min(
          conversation.messagesAtLastStep,
          replaced.index
        ),
      }
    const proposals = { ...conversation.proposals }
    const pending = conversation.pendingProposalId
      ? proposals[conversation.pendingProposalId]
      : null
    if (pending && pending.status === 'pending') {
      const superseded: StoredProposal = {
        ...pending,
        status: 'superseded',
        resolvedAt: at,
      }
      proposals[pending.id] = superseded
      outcomes.push(outcomeBlock(superseded, 'superseded'))
      resolveSuperseded(superseded)
    }
    trackTurnStarted({
      entry: input.entry,
      input: input.source,
      turn: conversation.turns + 1,
      pendingProposal: !!pending && pending.status === 'pending',
    })

    const userMessage: UserMessage = {
      role: 'user',
      at: isoAt(now),
      content: [...collapseOutcomes(outcomes), { type: 'text', text }],
    }
    const item: ScribeTimelineItem = {
      type: 'user',
      id: `${turnId}-u`,
      at,
      text,
      source: input.source,
    }
    conversation = {
      ...conversation,
      updatedAt: at,
      proposals,
      pendingProposalId: null,
      outcomes: [],
      items: [...conversation.items, item],
      suspended: null,
      turns: conversation.turns + 1,
    }

    // Not sent: the outcomes wait for the next message that is.
    const unsent = (
      failure: ScribeClientError,
      change?: Partial<StoredConversation>
    ) => {
      conversation = {
        ...conversation,
        outcomes: collapseOutcomes(outcomes),
        ...change,
      }
      putConversation(conversation)
      failTurn(conversation, failure, deps, at, EMPTY_STATS())
      return id
    }
    if (text.length > deps.limits().maxUserTextChars)
      return unsent(new ScribeClientError('too_large'))
    if (
      conversationBudget(conversation, deps, jsonBytes(userMessage)) === 'full'
    )
      return unsent(new ScribeClientError('context_full'), {
        contextFull: true,
      })
    conversation = {
      ...conversation,
      messages: [...conversation.messages, userMessage],
    }
    putConversation(conversation)

    await driveTurn(
      id,
      {
        turnId,
        step: 0,
        proposalId: null,
        effects: [],
        entry: input.entry,
        source: input.source,
        startedAt: at,
        stats: EMPTY_STATS(),
      },
      deps,
      signal.signal
    )
    return id
  } finally {
    endTurnSignal(id, signal)
  }
}

/** Re-runs the failed step of the last turn, as the same turn. */
export async function retryScribeTurn(
  deps: ScribeRuntimeDeps,
  conversationId: string
): Promise<void> {
  const conversation = getConversation(conversationId)
  const suspended = conversation?.suspended
  if (!conversation || !suspended) return
  const signal = beginTurnSignal(conversationId)
  if (!signal) return
  try {
    putConversation({ ...conversation, suspended: null })
    await driveTurn(conversationId, suspended, deps, signal.signal)
  } finally {
    endTurnSignal(conversationId, signal)
  }
}

/**
 * The connection came back: each turn that ended with `network`, and is still
 * the latest thing in Scribe AI, goes on once as Try again would. The same step
 * key, so ww-api counts it as one more attempt.
 */
export async function resumeAfterReconnect(
  deps: ScribeRuntimeDeps
): Promise<void> {
  await Promise.all(
    takeAwaitingConnection().map((id) => retryScribeTurn(deps, id))
  )
}

/** The steps of one turn, from `turn.step` until the model stops calling tools. */
async function driveTurn(
  conversationId: string,
  turn: SuspendedTurn,
  deps: ScribeRuntimeDeps,
  signal: AbortSignal
): Promise<void> {
  const reading: ScribeActivityArea[] = []
  /** The turn took a step for a reply after a silent memory save. */
  let memoryReplyStep = false
  let conversation = getConversation(conversationId)!
  const proposalId = turn.proposalId ?? `pr_${deps.ulid()}`
  const existing = conversation.proposals[proposalId]?.effects ?? turn.effects
  const refs = new RefRegistry(structuredClone(conversation.refs))
  const draft = new TurnDraft(proposalId, refs, existing)
  const stats = { ...turn.stats, failedWrites: { ...turn.stats.failedWrites } }
  let step = turn.step
  setRun(conversationId, { phase: 'sending' })
  startTurnDebug(conversationId, turn.startedAt)

  const suspendAt = (atStep: number): SuspendedTurn => ({
    ...turn,
    step: atStep,
    proposalId: draft.size ? proposalId : turn.proposalId,
    effects: draft.storedEffects(),
    stats: structuredClone(stats),
  })
  /** The cards so far, shown while the turn runs (memory only). */
  const showDraft = () =>
    setDrafting(
      conversationId,
      draft.size
        ? draftProposal(
            getConversation(conversationId)!,
            turn,
            draft,
            stats,
            deps
          )
        : null
    )
  /** Takes back what the running step's calls did, when it isn't kept. */
  let discardStep: (() => void) | null = null

  try {
    for (;;) {
      const limits = deps.limits()
      if (step >= limits.maxStepsPerTurn) {
        finishTurn(conversationId, turn, draft, refs, stats, deps, {
          kind: 'couldnt_finish',
        })
        return
      }
      conversation = withCurrentContext(
        getConversation(conversationId)!,
        deps,
        refs
      )
      const body: StepRequest = {
        protocol: SCRIBE_PROTOCOL,
        conversationId,
        turnId: turn.turnId,
        step,
        app: deps.app(),
        tools: toolDefinitions(deps.tools),
        context: conversation.context!,
        messages: conversation.messages,
      }
      putConversation({ ...conversation, suspended: suspendAt(step) })

      const streamItemId = `${turn.turnId}-${step}`
      let text = ''
      const calls: ToolCallBlock[] = []
      // Each call runs as it streams in; the step keeps them only if it ends
      // in `tool_calls`, so it starts from a checkpoint to go back to.
      const refsAtStep = refs.checkpoint()
      const effectsAtStep = draft.checkpoint()
      const stores = deps.stores()
      const runDeps = {
        tool: deps.tool,
        ctx: {
          now: deps.now(),
          today: localDayKey(deps.now()),
          context: conversation.context!,
          refs,
          stores,
          dataProtection:
            stores.preferences.dataProtectionMode ||
            (conversation.context?.dataProtection ?? false),
          draft,
        },
        draft,
        stores,
        context: conversation.context!,
        maxResultBytes: limits.maxToolResultBytes,
        readTimeoutMs: deps.readTimeoutMs,
        memory: stores.memory,
        tainted: stats.tainted,
      }
      let run = startToolCalls(runDeps)
      discardStep = () => {
        // Reads mint their Refs as they start, so nothing lands after this.
        refs.rollback(refsAtStep)
        draft.rollback(effectsAtStep)
        showDraft()
      }
      const discard = discardStep
      const terminal = await deps.client().step(body, {
        signal,
        onEvent: (event) => {
          // A dropped stream is sent again: its replay starts over, and so do
          // the calls the dropped one ran.
          if (event.type === 'start') {
            text = ''
            if (calls.length) {
              discard()
              run = startToolCalls(runDeps)
            }
            calls.length = 0
            setStreaming(conversationId, null)
            setRun(conversationId, { phase: 'thinking', reading: [...reading] })
            updateTurnDebug(conversationId, (d) => ({ ...d, streamedChars: 0 }))
          }
          if (event.type === 'text') {
            text += event.delta
            updateTurnDebug(conversationId, (d) => ({
              ...d,
              streamedChars: d.streamedChars + event.delta.length,
            }))
            setStreaming(conversationId, {
              itemId: streamItemId,
              at: deps.now().getTime(),
              text,
            })
          }
          if (event.type === 'tool_call') {
            const call: ToolCallBlock = {
              type: 'tool_call',
              callId: event.callId,
              name: event.name,
              args: event.args,
            }
            calls.push(call)
            run.add(call)
            const access = deps.tool(call.name)?.access ?? 'read'
            if (access !== 'read' && access !== 'memory') showDraft()
            updateTurnDebug(conversationId, (d) => ({
              ...d,
              streamedChars:
                d.streamedChars + JSON.stringify(event.args).length,
            }))
          }
        },
      })
      noteUsage(terminal.meter)
      if (terminal.type === 'error')
        throw fromStreamErrorCode(terminal.code, terminal.meter)
      updateTurnDebug(conversationId, (d) => ({
        ...d,
        outputTokens: d.outputTokens + terminal.usage.outputTokens,
        streamedChars: 0,
      }))
      stats.steps++

      conversation = getConversation(conversationId)!
      const messagesAtLastStep = conversation.messages.length
      const at = deps.now().getTime()
      const items: ScribeTimelineItem[] = [...conversation.items]
      if (text.trim())
        items.push({
          type: 'assistant',
          id: streamItemId,
          at,
          text,
          streaming: false,
        })
      setStreaming(conversationId, null)
      const messages: WireMessage[] = [...conversation.messages]
      const finish = terminal.finish
      const withCalls = finish === 'tool_calls' && calls.length > 0
      // `length` and `refused` drop the step's calls, and what they proposed.
      if (!withCalls && calls.length) discard()
      discardStep = null
      if (text.trim() || withCalls)
        messages.push({
          role: 'assistant',
          content: [
            ...(text.trim() ? [{ type: 'text' as const, text }] : []),
            ...(withCalls ? calls : []),
          ],
        })

      let next = false
      if (withCalls) {
        const outcome = await run.finish()
        messages.push({ role: 'tool', content: outcome.results })
        stats.readCalls += outcome.readCalls
        stats.writeCalls += outcome.writeCalls
        stats.invalidCalls += outcome.failed.length
        stats.tainted ||= outcome.untrusted
        for (const failure of outcome.failed)
          if (failure.write)
            stats.failedWrites[failure.name] =
              (stats.failedWrites[failure.name] ?? 0) + 1
        for (const name of outcome.proposed)
          if (stats.failedWrites[name]) stats.failedWrites[name]--
        reading.push(...outcome.areas)
        if (outcome.memoryEdits.length) {
          saveMemoryEdits(stores.memory.text, outcome)
        }
        // The model saves to memory without a word, expecting to answer
        // after; without cards, it gets that step, once a turn.
        const silentMemory =
          outcome.memoryCalls > 0 &&
          outcome.writeCalls === 0 &&
          !text.trim() &&
          !memoryReplyStep
        if (silentMemory) memoryReplyStep = true
        next =
          outcome.readCalls > 0 ||
          outcome.failed.length > 0 ||
          outcome.awaitsRef ||
          silentMemory
      }

      conversation = {
        ...conversation,
        messages,
        items,
        refs: structuredClone(refs.table),
        lastInputTokens: terminal.usage.inputTokens,
        messagesAtLastStep,
        updatedAt: at,
      }
      putConversation(noticeBudget(conversation, deps))

      if (finish === 'length') {
        finishTurn(conversationId, turn, draft, refs, stats, deps, {
          kind: 'too_much',
        })
        return
      }
      if (finish === 'refused') {
        finishTurn(conversationId, turn, draft, refs, stats, deps, {
          kind: 'refused',
        })
        return
      }
      if (!next) {
        finishTurn(conversationId, turn, draft, refs, stats, deps, null)
        return
      }
      step++
      if (step >= limits.maxStepsPerTurn) {
        finishTurn(conversationId, turn, draft, refs, stats, deps, {
          kind: 'couldnt_finish',
        })
        return
      }
      setRun(conversationId, { phase: 'thinking', reading: [...reading] })
    }
  } catch (error) {
    setStreaming(conversationId, null)
    // A failed or stopped step keeps nothing; earlier steps' cards stay.
    discardStep?.()
    const failure = toScribeClientError(error)
    conversation = getConversation(conversationId)!
    if (failure.code === 'cancelled') {
      finishTurn(
        conversationId,
        turn,
        draft,
        refs,
        stats,
        deps,
        null,
        'stopped'
      )
      return
    }
    if (failure.code === 'couldnt_finish') {
      finishTurn(conversationId, turn, draft, refs, stats, deps, {
        kind: 'couldnt_finish',
      })
      return
    }
    if (failure.code === 'limit_reached') {
      noteUsage(failure.usage)
      trackLimitReached({
        plan: failure.usage?.plan ?? 'free',
        window: failure.usage ? fullWindow(failure.usage) : null,
      })
      finishTurn(
        conversationId,
        turn,
        draft,
        refs,
        stats,
        deps,
        {
          kind: 'limit_reached',
          plan: failure.usage?.plan ?? 'free',
          resetsAt: failure.usage?.resetsAt ?? null,
        },
        'limit'
      )
      return
    }
    // Draft effects already proposed stay reviewable.
    const withDraft = finalizeProposal(
      conversation,
      turn,
      draft,
      refs,
      stats,
      deps
    )
    const suspended = toScribeError(failure).retryable ? suspendAt(step) : null
    let next: StoredConversation = { ...withDraft, suspended }
    if (failure.code === 'context_full')
      next = noticeBudget({ ...next, contextFull: true }, deps)
    putConversation(next)
    setDrafting(conversationId, null)
    failTurn(next, failure, deps, turn.startedAt, stats)
  }
}

/**
 * The turn's Proposal from its draft. Checks and choices the User made on the
 * cards so far (on the drafting Proposal, or a retried turn's stored one) carry
 * over.
 */
function draftProposal(
  conversation: StoredConversation,
  turn: SuspendedTurn,
  draft: TurnDraft,
  stats: TurnStats,
  deps: ScribeRuntimeDeps,
  invalidCount = 0
): StoredProposal {
  const drafting = useScribeRuns.getState().drafting[conversation.id]
  const previous =
    (drafting?.id === draft.proposalId ? drafting : null) ??
    conversation.proposals[draft.proposalId]
  const effects = draft.storedEffects()
  const cards = buildCards(effects, deps.stores())
  return {
    id: draft.proposalId,
    conversationId: conversation.id,
    turnId: turn.turnId,
    createdAt: previous?.createdAt ?? deps.now().getTime(),
    status: 'pending',
    effects,
    cards: previous ? mergeCards(previous.cards, cards) : cards,
    invalidCount,
    tainted: stats.tainted,
    resolvedAt: null,
  }
}

/** The turn's Proposal, ready for review; the conversation unchanged if none. */
function finalizeProposal(
  conversation: StoredConversation,
  turn: SuspendedTurn,
  draft: TurnDraft,
  refs: RefRegistry,
  stats: TurnStats,
  deps: ScribeRuntimeDeps
): StoredConversation {
  const withRefs = { ...conversation, refs: structuredClone(refs.table) }
  if (!draft.size) return withRefs
  const at = deps.now().getTime()
  const invalidCount = Object.values(stats.failedWrites).reduce(
    (sum, n) => sum + n,
    0
  )
  const proposal = draftProposal(
    conversation,
    turn,
    draft,
    stats,
    deps,
    invalidCount
  )
  const hasItem = conversation.items.some(
    (item) => item.type === 'proposal' && item.proposalId === proposal.id
  )
  return {
    ...withRefs,
    proposals: { ...conversation.proposals, [proposal.id]: proposal },
    pendingProposalId: proposal.id,
    items: hasItem
      ? conversation.items
      : [
          ...conversation.items,
          {
            type: 'proposal',
            id: `${proposal.id}-item`,
            at,
            proposalId: proposal.id,
          },
        ],
  }
}

function finishTurn(
  conversationId: string,
  turn: SuspendedTurn,
  draft: TurnDraft,
  refs: RefRegistry,
  stats: TurnStats,
  deps: ScribeRuntimeDeps,
  notice: ScribeNotice | null,
  outcome?: TurnOutcome
): void {
  setStreaming(conversationId, null)
  let conversation = finalizeProposal(
    getConversation(conversationId)!,
    turn,
    draft,
    refs,
    stats,
    deps
  )
  const at = deps.now().getTime()
  if (notice)
    conversation = {
      ...conversation,
      items: [
        ...conversation.items,
        { type: 'notice', id: `${turn.turnId}-n`, at, notice },
      ],
    }
  putConversation({ ...conversation, suspended: null, updatedAt: at })
  setDrafting(conversationId, null)
  trackTurnFinished({
    outcome: outcome ?? (draft.size ? 'proposal' : 'answer'),
    steps: stats.steps,
    readCalls: stats.readCalls,
    writeCalls: stats.writeCalls,
    invalidCalls: stats.invalidCalls,
    errorCode: outcome === 'limit' ? 'limit_reached' : null,
    durationMs: at - turn.startedAt,
  })
  if (outcome !== 'stopped') markFinishedTurn()
  setRun(conversationId, { phase: 'idle' })
}

/** Failures the app reacts to beyond the error row: a gate, or an app bug. */
const NOTED_CODES: ReadonlySet<ScribeErrorCode | 'cancelled'> = new Set([
  'device_ineligible',
  'attestation_unavailable',
  'suspended',
  'update_required',
  'disabled',
])

function failTurn(
  conversation: StoredConversation,
  failure: ScribeClientError,
  deps: ScribeRuntimeDeps,
  startedAt: number,
  stats: TurnStats
): void {
  const error = toScribeError(failure)
  if (
    (failure.serverCode && REPORTED_SERVER_CODES.has(failure.serverCode)) ||
    NOTED_CODES.has(failure.code)
  )
    deps.onFailure?.(failure)
  trackTurnFinished({
    outcome: 'error',
    steps: stats.steps,
    readCalls: stats.readCalls,
    writeCalls: stats.writeCalls,
    invalidCalls: stats.invalidCalls,
    errorCode: error.code,
    durationMs: deps.now().getTime() - startedAt,
  })
  const run: ScribeRun = { phase: 'error', error }
  setRun(conversation.id, run)
  if (error.code === 'network' && conversation.suspended)
    awaitConnection(conversation.id, run)
}
