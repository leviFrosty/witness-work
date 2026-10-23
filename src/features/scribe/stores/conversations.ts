import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type {
  ScribeEntryPoint,
  ScribeInputSource,
  ScribeTimelineItem,
} from '@/features/scribe/types'
import type {
  ProposalOutcomeBlock,
  ScribeContextWire,
  WireMessage,
} from '@/features/scribe/lib/wire'
import { emptyRefTable, type RefTable } from '@/features/scribe/runtime/refs'
import type {
  StoredEffect,
  StoredProposal,
} from '@/features/scribe/proposals/model'

/**
 * The turn a step is running for, or that stopped on an error, so Try again
 * re-runs that step. Saved before each step, so a turn the app was closed
 * during can be tried again too.
 */
export interface SuspendedTurn {
  turnId: string
  step: number
  proposalId: string | null
  /** The turn's draft effects so far. */
  effects: StoredEffect[]
  entry: ScribeEntryPoint
  source: ScribeInputSource
  startedAt: number
  stats: TurnStats
}

/** Counts for `scribe_turn_finished`. */
export interface TurnStats {
  steps: number
  readCalls: number
  writeCalls: number
  invalidCalls: number
  /** Write calls that failed, by tool name, not yet repaired by a later call. */
  failedWrites: Record<string, number>
  tainted: boolean
}

export interface StoredConversation {
  id: string
  createdAt: number
  updatedAt: number
  /** The first user message, ≤ 60 chars. */
  title: string
  /** Everything sent to the model, in order. */
  messages: WireMessage[]
  /** Pinned for the conversation; rebuilt when the local day changes. */
  context: ScribeContextWire | null
  contextDay: string | null
  refs: RefTable
  items: ScribeTimelineItem[]
  proposals: Record<string, StoredProposal>
  pendingProposalId: string | null
  /** Outcomes the next user message reports, oldest first. */
  outcomes: ProposalOutcomeBlock[]
  /** `done.usage.inputTokens` of the last step. */
  lastInputTokens: number | null
  /** How many of `messages` the last step's input held. */
  messagesAtLastStep: number
  /** Ww-api said the context is over `maxInputTokens` (413). */
  contextFull: boolean
  /** `scribe_context_full` was sent for this state. */
  contextNoticed: { nearFull: boolean; full: boolean }
  suspended: SuspendedTurn | null
  turns: number
}

/** Newest kept; older ones are deleted on launch. */
export const MAX_CONVERSATIONS = 50
export const CONVERSATION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
export const TITLE_MAX_CHARS = 60

export const titleFor = (text: string): string => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > TITLE_MAX_CHARS
    ? `${line.slice(0, TITLE_MAX_CHARS - 1)}…`
    : line
}

export function newConversation(
  id: string,
  now: number,
  firstText: string
): StoredConversation {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    title: titleFor(firstText),
    messages: [],
    context: null,
    contextDay: null,
    refs: emptyRefTable(),
    items: [],
    proposals: {},
    pendingProposalId: null,
    outcomes: [],
    lastInputTokens: null,
    messagesAtLastStep: 0,
    contextFull: false,
    contextNoticed: { nearFull: false, full: false },
    suspended: null,
    turns: 0,
  }
}

interface ScribeConversationsState {
  conversations: Record<string, StoredConversation>
  /** The User has finished a turn on this device (example lines hide). */
  hasFinishedTurn: boolean
}

/** The conversations to keep: the 50 most recently updated within 90 days. */
export function retainedConversations(
  conversations: Record<string, StoredConversation>,
  now: number
): Record<string, StoredConversation> {
  const kept = Object.values(conversations)
    .filter(
      (conversation) => now - conversation.updatedAt < CONVERSATION_MAX_AGE_MS
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS)
  return Object.fromEntries(
    kept.map((conversation) => [conversation.id, conversation])
  )
}

/**
 * Scribe AI conversations (ADR 0032): transcripts, pinned contexts, Refs,
 * timelines and Proposals. Device-only MMKV, never in iCloud Sync, Google Drive
 * or a backup file; the records a conversation added sync like any.
 */
export const useScribeConversations = create<ScribeConversationsState>()(
  persist<ScribeConversationsState>(
    () => ({ conversations: {}, hasFinishedTurn: false }),
    {
      name: 'scribe-conversations',
      version: 1,
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      merge: (persisted, current) => {
        const restored = (persisted ?? {}) as Partial<ScribeConversationsState>
        return {
          ...current,
          ...restored,
          conversations: retainedConversations(
            restored.conversations ?? {},
            Date.now()
          ),
        }
      },
    }
  )
)

export const getConversation = (id: string): StoredConversation | null =>
  useScribeConversations.getState().conversations[id] ?? null

/** Replaces a conversation (or adds it). */
export function putConversation(conversation: StoredConversation): void {
  useScribeConversations.setState(({ conversations }) => ({
    conversations: { ...conversations, [conversation.id]: conversation },
  }))
}

/** Applies `change` to a conversation if it still exists. */
export function updateConversation(
  id: string,
  change: (conversation: StoredConversation) => StoredConversation
): StoredConversation | null {
  const current = getConversation(id)
  if (!current) return null
  const next = change(current)
  putConversation(next)
  return next
}

export function deleteStoredConversation(id: string): void {
  useScribeConversations.setState(({ conversations }) => {
    const { [id]: _removed, ...rest } = conversations
    return { conversations: rest }
  })
}

export function pruneConversations(now: number = Date.now()): void {
  useScribeConversations.setState(({ conversations }) => ({
    conversations: retainedConversations(conversations, now),
  }))
}

export function markFinishedTurn(): void {
  if (!useScribeConversations.getState().hasFinishedTurn)
    useScribeConversations.setState({ hasFinishedTurn: true })
}
