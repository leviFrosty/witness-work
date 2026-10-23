import type {
  ScribeContactChoice,
  ScribeEntryPoint,
  ScribeInputSource,
  ScribeUndoSource,
} from '@/features/scribe/types'
import type {
  ScribeStatusWire,
  StepRequest,
  UsageSnapshotWire,
} from '@/features/scribe/lib/wire'
import {
  hasScribeClientOverride,
  setScribeClientOverride,
} from '@/features/scribe/lib/defaultClient'
import { ulid } from '@/features/scribe/lib/ulid'
import { scribeRuntime } from '@/features/scribe/runtime/deps'
import {
  conversationBudget,
  retryScribeTurn,
  sendScribeMessage,
} from '@/features/scribe/runtime/turnLoop'
import {
  abortTurn,
  getRun,
  useScribeRuns,
} from '@/features/scribe/runtime/runs'
import {
  refreshDeviceGate,
  refreshStatus,
  refreshUsage,
} from '@/features/scribe/runtime/status'
import {
  buildScribeContext,
  readScribeStores,
} from '@/features/scribe/runtime/snapshot'
import { RefRegistry, emptyRefTable } from '@/features/scribe/runtime/refs'
import { deviceTimeZone, appLocale } from '@/features/scribe/lib/locale'
import { toolDefinitions } from '@/features/scribe/runtime/wireTools'
import { jsonBytes } from '@/features/scribe/runtime/budget'
import { toScribeProposal } from '@/features/scribe/proposals/cards'
import {
  addScribeProposal,
  chooseProposalContact,
  dismissScribeProposal,
  findProposal,
  toggleProposalCard,
  undoScribeProposalNow,
} from '@/features/scribe/proposals/actions'
import { useScribeConversations } from '@/features/scribe/stores/conversations'
import { useScribeLedger } from '@/features/scribe/stores/ledger'
import { noteUsage, useScribeUsageStore } from '@/features/scribe/stores/usage'
import { currentUsageSnapshot } from '@/features/scribe/lib/usageSnapshot'
import {
  INITIAL_GATE,
  noteGate,
  scribeLimits,
  useScribeStatusStore,
  type ScribeDeviceGate,
} from '@/features/scribe/stores/status'
import { listLegacyImports } from '@/features/scribe/legacy/notesImportLedger'
import { scribeAvailability } from '@/features/scribe/hooks/useScribeAvailability'
import { conversationSummary } from '@/features/scribe/hooks/useScribeHistory'
import { SCRIBE_TOOLS } from '@/features/scribe/tools'
import { MMKV } from 'react-native-mmkv'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import { allTimeEntries } from '@/features/scribe/runtime/snapshot'
import { getOnline } from '@/lib/http/online'
import { appVersion, useUpdateRequired } from '@/lib/appUpdate'
import {
  callsStep,
  fake,
  FAKE_SCRIPT_NAMES,
  fakeScribeClient,
  type FakeCall,
  fakeStatus,
  fakeUsage,
  queueScript,
  type FakeScriptName,
} from '@/app/dev-harness/scribeFake'

let last: unknown = null

/** The saved usage as the app reads it now (past resets aged out). */
const currentSnapshot = () => {
  const snapshot = useScribeUsageStore.getState().snapshot
  return snapshot ? currentUsageSnapshot(snapshot, Date.now()) : null
}

/** Starts `work`; its result (or `{ error }`) lands in `scribe.last`. */
const tracked = (work: () => Promise<unknown>) => {
  last = null
  void work()
    .then((value) => {
      last = value ?? { done: true }
    })
    .catch((error: unknown) => {
      last = { error: String(error) }
    })
  return 'started'
}

/** The current snapshot's size, as a step would send it. */
export function scribeContextSize() {
  const stores = readScribeStores()
  const context = buildScribeContext(stores, new RefRegistry(emptyRefTable()), {
    now: new Date(),
    locale: appLocale(),
    tz: deviceTimeZone(),
  })
  const tools = toolDefinitions(SCRIBE_TOOLS)
  return {
    contextBytes: jsonBytes(context),
    contacts: context.contacts.length,
    contactsTruncated: context.contactsTruncated,
    plans: context.plans.length,
    toolsBytes: jsonBytes(tools),
    tools: tools.length,
  }
}

/** A conversation as the verify harness reads it: structure, with the text. */
function conversationView(id: string) {
  const conversation = useScribeConversations.getState().conversations[id]
  if (!conversation) return null
  const stores = readScribeStores()
  return {
    ...conversationSummary(conversation),
    run: getRun(id),
    streaming: useScribeRuns.getState().streaming[id]?.text ?? null,
    budget: conversationBudget(conversation, {
      tools: SCRIBE_TOOLS,
      limits: scribeLimits,
    }),
    lastInputTokens: conversation.lastInputTokens,
    contextFull: conversation.contextFull,
    suspendedStep: conversation.suspended?.step ?? null,
    pendingProposalId: conversation.pendingProposalId,
    queuedOutcomes: conversation.outcomes.map((outcome) => outcome.outcome),
    messages: conversation.messages.map((message) => ({
      role: message.role,
      blocks: message.content.map((block) => block.type),
    })),
    items: conversation.items.map((item) =>
      item.type === 'proposal'
        ? {
            type: item.type,
            proposal: toScribeProposal(
              conversation.proposals[item.proposalId],
              stores
            ),
          }
        : item
    ),
  }
}

/**
 * Scribe AI for the verify harness (`__WW_DEV__.scribe`). `enableFake()`
 * answers every call on the device (`fake`): queue a canned turn with
 * `script(name)`, then `send(text)`. Reads are synchronous; `send`, `retry` and
 * `refresh` start and put their result in `last`.
 */
export const scribeHarness = {
  get last() {
    return last
  },
  scripts: FAKE_SCRIPT_NAMES,
  fake,
  /** Answer Scribe AI from the on-device fake (true) or ww-api (false). */
  enableFake: (on = true) => {
    setScribeClientOverride(on ? fakeScribeClient : null)
    useScribeStatusStore.setState({ fetchedAt: 0 })
    void refreshStatus({ force: true })
    return hasScribeClientOverride()
  },
  usingFake: hasScribeClientOverride,
  /** Queues a canned turn for the fake; returns the steps waiting. */
  script: (name: FakeScriptName) => queueScript(name),
  /**
   * Queues one write step whose calls `calls(body)` builds from the step's
   * request (`body.context` has the Refs), for any Proposal the scripts lack.
   */
  scriptCalls: (calls: (body: StepRequest) => FakeCall[]) => {
    fake.queue.push(callsStep(calls))
    return fake.queue.length
  },
  clearScript: () => {
    fake.queue.length = 0
    return 0
  },
  setFakeStatus: (change: Partial<ScribeStatusWire>) => {
    fake.status = fakeStatus(change)
    return tracked(() => refreshStatus({ force: true }))
  },
  /** Changes the fake's usage and shows it (`limited`, `windows`, `plan`). */
  setFakeUsage: (change: Partial<UsageSnapshotWire>) => {
    fake.usage = fakeUsage(change)
    noteUsage(fake.usage)
    return fake.usage
  },
  /**
   * Forces device-gate fields (`ineligible`, `suspended`, …); `{}` re-reads
   * them.
   */
  setGate: (change: Partial<ScribeDeviceGate>) => {
    if (Object.keys(change).length === 0) {
      noteGate(INITIAL_GATE)
      return tracked(refreshDeviceGate)
    }
    noteGate(change)
    return useScribeStatusStore.getState().gate
  },
  /** Sends a message in a conversation (a new one when omitted). */
  send: (
    text: string,
    options: {
      conversationId?: string
      entry?: ScribeEntryPoint
      source?: ScribeInputSource
    } = {}
  ) => {
    const conversationId = options.conversationId ?? ulid()
    tracked(() =>
      sendScribeMessage(scribeRuntime(), conversationId, {
        text,
        entry: options.entry ?? 'conversation',
        source: options.source ?? 'keyboard',
      })
    )
    return conversationId
  },
  /**
   * A Proposal without the model: the fake answers a canned write turn. Returns
   * the conversation id; the Proposal is pending once `last` is set.
   */
  injectProposal: (
    script: FakeScriptName = 'planAndLog',
    text = 'Plan 2 hours tomorrow at 9 and log an hour and a half for today'
  ) => {
    setScribeClientOverride(fakeScribeClient)
    queueScript(script)
    return scribeHarness.send(text)
  },
  retry: (conversationId: string) =>
    tracked(() => retryScribeTurn(scribeRuntime(), conversationId)),
  stop: (conversationId: string) => {
    abortTurn(conversationId)
    return getRun(conversationId).phase
  },
  refresh: () =>
    tracked(async () => {
      await refreshStatus({ force: true })
      await refreshUsage({ force: true })
      return { status: useScribeStatusStore.getState().status }
    }),
  /** What `useScribeAvailability` would return now. */
  availability: () =>
    scribeAvailability({
      enabled: true,
      status: useScribeStatusStore.getState().status,
      online: getOnline(),
      updateRequiredByServer:
        useUpdateRequired.getState().required?.source === 'server',
      appVersion: appVersion(),
      gate: useScribeStatusStore.getState().gate,
      devClient: useScribeStatusStore.getState().devClient,
      usage: currentSnapshot(),
    }),
  state: () => {
    const status = useScribeStatusStore.getState()
    return {
      fake: hasScribeClientOverride(),
      queuedSteps: fake.queue.length,
      status: status.status,
      statusFailed: status.failed,
      gate: status.gate,
      usage: useScribeUsageStore.getState().snapshot,
      hasFinishedTurn: useScribeConversations.getState().hasFinishedTurn,
      conversations: Object.values(
        useScribeConversations.getState().conversations
      )
        .map(conversationSummary)
        .sort((a, b) => b.updatedAt - a.updatedAt),
      undoable: Object.keys(useScribeLedger.getState().records),
      legacyImports: listLegacyImports(),
    }
  },
  conversation: conversationView,
  /** The newest conversation, as `conversation(id)` reads it. */
  latest: () => {
    const newest = Object.values(
      useScribeConversations.getState().conversations
    ).sort((a, b) => b.updatedAt - a.updatedAt)[0]
    return newest ? conversationView(newest.id) : null
  },
  proposal: (proposalId: string) => {
    const stored = findProposal(
      useScribeConversations.getState().conversations,
      proposalId
    )
    return stored ? toScribeProposal(stored, readScribeStores()) : null
  },
  toggle: (proposalId: string, cardId: string) => {
    toggleProposalCard(proposalId, cardId)
    return scribeHarness.proposal(proposalId)
  },
  choose: (proposalId: string, cardId: string, choice: ScribeContactChoice) => {
    chooseProposalContact(proposalId, cardId, choice)
    return scribeHarness.proposal(proposalId)
  },
  add: (proposalId: string) => addScribeProposal(proposalId),
  dismiss: (proposalId: string) => {
    dismissScribeProposal(proposalId)
    return scribeHarness.proposal(proposalId)?.status ?? null
  },
  undo: (proposalId: string, source: ScribeUndoSource = 'toast') =>
    undoScribeProposalNow(proposalId, source),
  seedLegacyImport,
  contextSize: scribeContextSize,
  /** The step bodies the fake answered, newest last (tools, context, messages). */
  requests: () => fake.requests,
  /** Forgets Scribe AI's conversations, undo records and usage on this device. */
  clear: () => {
    clearScribeLocalData()
    return 'cleared'
  },
  stores: {
    conversations: useScribeConversations,
    ledger: useScribeLedger,
    usage: useScribeUsageStore,
    status: useScribeStatusStore,
    runs: useScribeRuns,
  },
}

/**
 * A Notes Import from before Scribe AI, accepted `daysAgo` days ago: a Contact
 * with a Visit, a Time Entry, and the ledger row History's Earlier imports
 * undoes. Returns the row's id.
 */
function seedLegacyImport(daysAgo = 3): string {
  const acceptedAt = Date.now() - daysAgo * 86_400_000
  const id = `legacy-${acceptedAt}`
  const date = new Date(acceptedAt)
  const contactId = `${id}-contact`
  const visitId = `${id}-visit`
  const entryId = `${id}-entry`
  useContacts.getState().addContact({
    id: contactId,
    name: 'Priya Natarajan',
    createdAt: date,
    address: { line1: '18 Cedar Ln', city: 'San Francisco', state: 'CA' },
  })
  useConversations.getState().addConversation({
    id: visitId,
    contact: { id: contactId },
    date,
    isBibleStudy: false,
    note: 'Talked about the Bible’s view of family',
  })
  useServiceReport
    .getState()
    .addServiceReport({ id: entryId, hours: 1, minutes: 30, date })
  const entry = allTimeEntries(useServiceReport.getState().serviceReports).find(
    (candidate) => candidate.id === entryId
  )
  new MMKV({ id: 'notes-import-ledger' }).set(
    `entry:${id}`,
    JSON.stringify({
      hash: id,
      state: 'done',
      summary: 'Notes from the cart',
      acceptedAt,
      updatedAt: acceptedAt,
      commit: {
        insertedContactIds: [contactId],
        insertedVisitIds: [visitId],
        insertedTimeEntries: entry ? [entry] : [],
        insertedCategoryIds: [],
        insertedCustomFieldDefIds: [],
        publisherChange: null,
      },
    })
  )
  return id
}

/** Tools' Clear Scribe AI local data. Records Scribe AI added stay. */
export function clearScribeLocalData(): void {
  for (const id of Object.keys(useScribeConversations.getState().conversations))
    abortTurn(id)
  useScribeConversations.setState(
    useScribeConversations.getInitialState(),
    true
  )
  useScribeLedger.setState(useScribeLedger.getInitialState(), true)
  useScribeUsageStore.setState(useScribeUsageStore.getInitialState(), true)
  useScribeRuns.setState(useScribeRuns.getInitialState(), true)
}
