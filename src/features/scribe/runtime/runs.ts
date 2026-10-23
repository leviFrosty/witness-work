import { create } from 'zustand'
import type { ScribeRun } from '@/features/scribe/types'
import type { StoredProposal } from '@/features/scribe/proposals/model'

/** The step's assistant text while it streams, kept out of MMKV. */
export interface StreamingText {
  itemId: string
  at: number
  text: string
}

/** Developer Tools' readout of a running turn: how long, and about how much. */
export interface TurnDebug {
  startedAt: number
  /** Output tokens of the turn's finished steps, reasoning included. */
  outputTokens: number
  /** Text and tool arguments streamed so far in the current step. */
  streamedChars: number
}

interface ScribeRunsState {
  runs: Record<string, ScribeRun>
  streaming: Record<string, StreamingText | null>
  debug: Record<string, TurnDebug>
  /**
   * The running turn's Proposal as its calls stream in, until the turn ends and
   * stores it. The User can already check cards and choose Contacts.
   */
  drafting: Record<string, StoredProposal | null>
}

export const IDLE_RUN: ScribeRun = { phase: 'idle' }

/** What each conversation's turn is doing now. Memory only. */
export const useScribeRuns = create<ScribeRunsState>()(() => ({
  runs: {},
  streaming: {},
  debug: {},
  drafting: {},
}))

export function setRun(conversationId: string, run: ScribeRun): void {
  useScribeRuns.setState(({ runs }) => ({
    runs: { ...runs, [conversationId]: run },
  }))
}

export const getRun = (conversationId: string): ScribeRun =>
  useScribeRuns.getState().runs[conversationId] ?? IDLE_RUN

export function setStreaming(
  conversationId: string,
  streaming: StreamingText | null
): void {
  useScribeRuns.setState((state) => ({
    streaming: { ...state.streaming, [conversationId]: streaming },
  }))
}

export function startTurnDebug(conversationId: string, startedAt: number) {
  useScribeRuns.setState(({ debug }) => ({
    debug: {
      ...debug,
      [conversationId]: { startedAt, outputTokens: 0, streamedChars: 0 },
    },
  }))
}

export function updateTurnDebug(
  conversationId: string,
  update: (debug: TurnDebug) => TurnDebug
) {
  useScribeRuns.setState((state) => {
    const current = state.debug[conversationId]
    return current
      ? { debug: { ...state.debug, [conversationId]: update(current) } }
      : state
  })
}

export function setDrafting(
  conversationId: string,
  proposal: StoredProposal | null
): void {
  useScribeRuns.setState((state) => ({
    drafting: { ...state.drafting, [conversationId]: proposal },
  }))
}

/** The Proposal a running turn is drafting, by id. */
export const draftingProposal = (
  drafting: ScribeRunsState['drafting'],
  proposalId: string
): StoredProposal | null =>
  Object.values(drafting).find((proposal) => proposal?.id === proposalId) ??
  null

/** A card choice on a drafting Proposal; false when it isn't drafting. */
export function changeDrafting(
  proposalId: string,
  change: (proposal: StoredProposal) => StoredProposal
): boolean {
  const { drafting } = useScribeRuns.getState()
  const entry = Object.entries(drafting).find(
    ([, proposal]) => proposal?.id === proposalId
  )
  if (!entry?.[1]) return false
  setDrafting(entry[0], change(entry[1]))
  return true
}

const controllers = new Map<string, AbortController>()

/** The running turn's abort controller, one per conversation. */
export function beginTurnSignal(
  conversationId: string
): AbortController | null {
  if (controllers.has(conversationId)) return null
  const controller = new AbortController()
  controllers.set(conversationId, controller)
  return controller
}

export function endTurnSignal(
  conversationId: string,
  controller: AbortController
) {
  if (controllers.get(conversationId) === controller)
    controllers.delete(conversationId)
}

export const isTurnRunning = (conversationId: string): boolean =>
  controllers.has(conversationId)

export function abortTurn(conversationId: string): void {
  controllers.get(conversationId)?.abort()
}

export function abortAllTurns(): void {
  for (const controller of controllers.values()) controller.abort()
}

/**
 * Turns that ended for a lost connection, each with the run it ended in. Each
 * goes on once when the connection comes back, while that failure is still the
 * latest thing in Scribe AI. Memory only.
 */
const awaitingConnection = new Map<string, ScribeRun>()

export function awaitConnection(conversationId: string, run: ScribeRun): void {
  awaitingConnection.set(conversationId, run)
}

/**
 * The User moved on (typed, sent, started a new conversation): no turn goes on
 * by itself; Try again still can.
 */
export function forgoResume(): void {
  awaitingConnection.clear()
}

/** The conversations whose turn can go on now; each is handed out once. */
export function takeAwaitingConnection(): string[] {
  const ready = [...awaitingConnection]
    .filter(([id, run]) => getRun(id) === run && !isTurnRunning(id))
    .map(([id]) => id)
  awaitingConnection.clear()
  return ready
}
