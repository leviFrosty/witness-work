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

export interface SuspendedTurn {
  turnId: string
  step: number
  proposalId: string | null

  effects: StoredEffect[]
  entry: ScribeEntryPoint
  source: ScribeInputSource
  startedAt: number
  stats: TurnStats
}

export interface TurnStats {
  steps: number
  readCalls: number
  writeCalls: number
  invalidCalls: number

  failedWrites: Record<string, number>
  tainted: boolean
}

export interface StoredConversation {
  id: string
  createdAt: number
  updatedAt: number

  title: string

  messages: WireMessage[]

  context: ScribeContextWire | null
  contextDay: string | null
  refs: RefTable
  items: ScribeTimelineItem[]
  proposals: Record<string, StoredProposal>
  pendingProposalId: string | null

  outcomes: ProposalOutcomeBlock[]

  lastInputTokens: number | null

  messagesAtLastStep: number

  contextFull: boolean

  contextNoticed: { nearFull: boolean; full: boolean }
  suspended: SuspendedTurn | null
  turns: number
}

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

  hasFinishedTurn: boolean
}

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

export function putConversation(conversation: StoredConversation): void {
  useScribeConversations.setState(({ conversations }) => ({
    conversations: { ...conversations, [conversation.id]: conversation },
  }))
}

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
