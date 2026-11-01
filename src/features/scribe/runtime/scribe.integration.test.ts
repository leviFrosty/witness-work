import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios', select: (options: { ios?: unknown }) => options.ios },
  AppState: { currentState: 'active', addEventListener: vi.fn() },
}))
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid',
  getRandomBytes: (n: number) => new Uint8Array(n),
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: vi.fn(),
}))
vi.mock('@/lib/contactAvatarFiles', () => ({
  deleteAvatarFiles: vi.fn(async () => {}),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn(), captureMessage: vi.fn() },
}))

import moment from 'moment'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import {
  DEFAULT_SCRIBE_LIMITS,
  type StepRequest,
  type StepStreamEvent,
} from '@/features/scribe/lib/wire'
import { createScribeClient } from '@/features/scribe/lib/scribeClient'
import {
  fakeFetch,
  fakeSessions,
  sseResponse,
  type RecordedRequest,
} from '@/features/scribe/lib/__fixtures__/sse'
import { sendScribeMessage } from '@/features/scribe/runtime/turnLoop'
import {
  allTimeEntries,
  readScribeStores,
} from '@/features/scribe/runtime/snapshot'
import { toScribeProposal } from '@/features/scribe/proposals/cards'
import {
  addScribeProposal,
  undoScribeProposalNow,
} from '@/features/scribe/proposals/actions'
import {
  getConversation,
  useScribeConversations,
} from '@/features/scribe/stores/conversations'
import { useScribeLedger } from '@/features/scribe/stores/ledger'
import { useScribeUsageStore } from '@/features/scribe/stores/usage'
import { SCRIBE_TOOLS, scribeTool } from '@/features/scribe/tools'
import {
  fixtureStores,
  NOW,
  PREFERENCES,
  TODAY,
} from '@/features/scribe/tools/__fixtures__/stores'

const URLS = {
  status: 'https://api.test/scribe/v1/status',
  usage: 'https://api.test/scribe/v1/usage',
  step: 'https://api.test/scribe/v1/step',
  transcribe: 'https://api.test/scribe/v1/transcribe',
}

const meter = (percentUsed: number) => ({
  plan: 'free' as const,
  supporterCheckFailed: false,
  windows: [
    { id: 'monthly' as const, percentUsed, resetsAt: 1_900_000_000_000 },
  ],
  limited: false,
  resetsAt: null,
  asOf: 1_800_000_000_000 + percentUsed,
})

const done = (
  finish: 'tool_calls' | 'end',
  inputTokens: number,
  percentUsed: number
): StepStreamEvent => ({
  type: 'done',
  finish,
  usage: {
    inputTokens,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 80,
    reasoningTokens: 0,
    units: 900,
  },
  meter: meter(percentUsed),
})

const model = (request: RecordedRequest) => {
  const body = request.body as StepRequest
  if (body.step === 0)
    return sseResponse(
      [
        {
          type: 'start',
          offered: body.tools.map((tool) => tool.name),
          dropped: [],
        },
        ':\n\n',
        {
          type: 'tool_call',
          callId: 'call_plans',
          name: 'plans_list',
          args: { from: '2026-10-22', to: '2026-10-22' },
        },
        done('tool_calls', 3_900, 1),
      ],
      { chunkSize: 37, signal: request.signal }
    )
  return sseResponse(
    [
      { type: 'start', offered: [], dropped: [] },
      { type: 'text', delta: 'Tomorrow already has 2 hours at 9, ' },
      { type: 'text', delta: 'so I planned Friday.' },
      {
        type: 'tool_call',
        callId: 'call_plan',
        name: 'plans_create',
        args: {
          date: '2026-10-23',
          minutes: 120,
          startMinutes: 9 * 60,
          anytime: false,
          categoryRef: null,
          newCategory: null,
          title: null,
          note: null,
          dateSpoken: 'Friday',
          timeSpoken: 'at 9',
          withBuddies: null,
          repeats: false,
        },
      },
      {
        type: 'tool_call',
        callId: 'call_time',
        name: 'time_log',
        args: {
          date: TODAY,
          minutes: 90,
          categoryRef: null,
          newCategory: null,
          note: null,
          dateSpoken: 'this morning',
        },
      },
      done('tool_calls', 4_400, 2),
    ],
    { crlf: true, signal: request.signal }
  )
}

function seed() {
  const stores = fixtureStores()
  useContacts.setState({ contacts: [...stores.contacts], deletedContacts: [] })
  useConversations.setState({
    conversations: [...stores.visits],
    deletedConversations: [],
  })
  useServiceReport.setState({
    serviceReports: stores.serviceReports,
    dayPlans: [...stores.dayPlans],
    recurringPlans: [...stores.recurringPlans],
  })
  useCategories.setState({ categories: [...stores.categories] })
  usePreferences.setState({
    role: PREFERENCES.role,
    dataProtectionMode: false,
  })
}

const ministry = () => ({
  plans: useServiceReport
    .getState()
    .dayPlans.map(
      (plan) => `${moment.utc(plan.date).format('YYYY-MM-DD')} ${plan.minutes}`
    )
    .sort(),
  entries: allTimeEntries(useServiceReport.getState().serviceReports)
    .map((entry) => `${entry.id} ${entry.hours}:${entry.minutes}`)
    .sort(),
})

beforeEach(() => {
  seed()
  useScribeConversations.setState(
    useScribeConversations.getInitialState(),
    true
  )
  useScribeLedger.setState(useScribeLedger.getInitialState(), true)
  useScribeUsageStore.setState(useScribeUsageStore.getInitialState(), true)
})

it('runs a whole turn against ww-api: read, writes, review, Add, Undo', async () => {
  const streamFetch = fakeFetch(model)
  const sessions = fakeSessions()
  const linkBeforePaidCall = vi.fn(async () => {})
  const client = createScribeClient({
    urls: URLS,
    streamFetch,
    sessions,
    linkBeforePaidCall,
    sleep: async () => {},
  })
  let seq = 0
  const before = ministry()

  const conversationId = await sendScribeMessage(
    {
      client: () => client,
      stores: readScribeStores,
      now: () => NOW,
      ulid: () => `01J${String(++seq).padStart(23, '0')}`,
      app: () => ({ version: '1.0.0', platform: 'ios', locale: 'en-US' }),
      tz: () => 'America/Chicago',
      limits: () => DEFAULT_SCRIBE_LIMITS,
      tools: SCRIBE_TOOLS,
      tool: scribeTool,
    },
    null,
    {
      text: 'Plan two hours Friday at 9 unless tomorrow has a plan, and log an hour and a half from this morning',
      source: 'voice',
      entry: 'home_orb',
    }
  )

  expect(streamFetch.calls).toHaveLength(2)
  for (const call of streamFetch.calls) {
    expect(call.url).toBe(URLS.step)
    expect(call.method).toBe('POST')
    expect(call.headers.authorization).toBe('Bearer token-1')
    expect(call.headers.accept).toBe('text/event-stream')
  }
  expect(linkBeforePaidCall).toHaveBeenCalled()
  const [first, second] = streamFetch.calls.map(
    (call) => call.body as StepRequest
  )
  expect(first.tools.map((tool) => tool.name)).toEqual(
    SCRIBE_TOOLS.map((tool) => tool.name)
  )
  const toolMessage = second.messages.at(-1)!
  expect(toolMessage.role === 'tool' && toolMessage.content[0]).toMatchObject({
    callId: 'call_plans',
    ok: true,
    data: { plans: ['p1 2026-10-22 120m 09:00 k0'] },
  })

  expect(ministry()).toEqual(before)
  const conversation = getConversation(conversationId)!
  const proposal = conversation.proposals[conversation.pendingProposalId!]
  const review = toScribeProposal(proposal, readScribeStores())
  expect(review.cards.map((card) => card.kind)).toEqual(['plan', 'time'])
  expect(review.cards[0].effects[0].preview).toMatchObject({
    kind: 'plan.create',
    date: '2026-10-23',
    minutes: 120,
    startMinutes: 540,
    spoken: { date: 'Friday', time: 'at 9' },
  })
  expect(review.cards[1].effects[0].preview).toMatchObject({
    kind: 'time.create',
    minutes: 90,
    spoken: { date: 'this morning' },
  })
  expect(conversation.items.map((item) => item.type)).toEqual([
    'user',
    'assistant',
    'proposal',
  ])
  expect(conversation.lastInputTokens).toBe(4_400)
  expect(useScribeUsageStore.getState().snapshot?.windows[0].percentUsed).toBe(
    2
  )

  expect(addScribeProposal(proposal.id)).toEqual({
    status: 'applied',
    appliedCards: 2,
    skippedCards: 0,
  })
  const added = ministry()
  expect(added.plans).toEqual([...before.plans, '2026-10-23 120'].sort())
  expect(added.entries).toHaveLength(before.entries.length + 1)
  expect(added.entries.some((entry) => entry.endsWith(' 1:30'))).toBe(true)

  expect(undoScribeProposalNow(proposal.id, 'toast')).toEqual({
    status: 'undone',
    kept: 0,
  })
  expect(ministry()).toEqual(before)

  expect(
    getConversation(conversationId)!.outcomes.map((outcome) => outcome.outcome)
  ).toEqual(['applied', 'undone'])
})
