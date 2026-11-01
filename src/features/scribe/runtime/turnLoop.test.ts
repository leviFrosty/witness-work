import { beforeEach, describe, expect, it, vi } from 'vitest'

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
const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn(), captureMessage: vi.fn() },
}))

import {
  DEFAULT_SCRIBE_LIMITS,
  type ScribeLimitsWire,
  type StepRequest,
  type StepStreamEvent,
  type UsageSnapshotWire,
  type UserMessage,
} from '@/features/scribe/lib/wire'
import type { ScribeClient } from '@/features/scribe/lib/scribeClient'
import { ScribeClientError } from '@/features/scribe/lib/errors'
import {
  resumeAfterReconnect,
  retryScribeTurn,
  sendScribeMessage,
  type ScribeRuntimeDeps,
} from '@/features/scribe/runtime/turnLoop'
import {
  abortTurn,
  forgoResume,
  getRun,
  useScribeRuns,
} from '@/features/scribe/runtime/runs'
import { toggleProposalCard } from '@/features/scribe/proposals/actions'
import {
  getConversation,
  useScribeConversations,
} from '@/features/scribe/stores/conversations'
import { useScribeUsageStore } from '@/features/scribe/stores/usage'
import { useScribeMemory } from '@/features/scribe/stores/memory'
import { SCRIBE_TOOLS, scribeTool } from '@/features/scribe/tools'
import {
  fixtureStores,
  NOW,
  TODAY,
} from '@/features/scribe/tools/__fixtures__/stores'
import type { ScribeStores } from '@/features/scribe/runtime/snapshot'

type FakeEvent = StepStreamEvent | (() => void)
type FakeStep = (
  body: StepRequest,
  signal?: AbortSignal
) => FakeEvent[] | Promise<FakeEvent[]>

let callSeq = 0
const call = (
  name: string,
  args: Record<string, unknown>
): StepStreamEvent => ({
  type: 'tool_call',
  callId: `call_${++callSeq}`,
  name,
  args,
})
const start = (): StepStreamEvent => ({
  type: 'start',
  offered: [],
  dropped: [],
})
const text = (delta: string): StepStreamEvent => ({ type: 'text', delta })
const done = (
  finish: 'tool_calls' | 'end' | 'length' | 'refused',
  inputTokens = 4_000,
  meter: UsageSnapshotWire | null = null
): StepStreamEvent => ({
  type: 'done',
  finish,
  usage: {
    inputTokens,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 50,
    reasoningTokens: 0,
    units: 100,
  },
  meter,
})
const failure = (
  code: string,
  meter: UsageSnapshotWire | null = null
): StepStreamEvent => ({
  type: 'error',
  code,
  message: code,
  retryable: true,
  meter,
})

function fakeClient(steps: FakeStep[]) {
  const bodies: StepRequest[] = []
  const client: ScribeClient = {
    status: async () => {
      throw new Error('not used')
    },
    usage: async () => {
      throw new Error('not used')
    },
    transcribe: async () => {
      throw new Error('not used')
    },
    step: async (body, { signal, onEvent }) => {
      bodies.push(structuredClone(body))
      const step = steps.shift()
      if (!step) throw new Error(`unexpected step ${body.step}`)
      const events = await step(body, signal)
      for (const event of events) {
        if (typeof event === 'function') {
          event()
          continue
        }
        onEvent(event)
        if (event.type === 'done' || event.type === 'error') return event
      }
      throw new ScribeClientError('network')
    },
  }
  return { client, bodies, steps }
}

let idSeq = 0
let stores: ScribeStores
let now = NOW

function runtime(
  client: ScribeClient,
  limits: Partial<ScribeLimitsWire> = {}
): ScribeRuntimeDeps {
  return {
    client: () => client,
    stores: () => stores,
    now: () => now,
    ulid: () => `01J${String(++idSeq).padStart(23, '0')}`,
    app: () => ({ version: '1.0.0', platform: 'ios', locale: 'en-US' }),
    tz: () => 'America/Chicago',
    limits: () => ({ ...DEFAULT_SCRIBE_LIMITS, ...limits }),
    tools: SCRIBE_TOOLS,
    tool: scribeTool,
    onFailure: vi.fn(),
  }
}

const send = (
  deps: ScribeRuntimeDeps,
  value: string,
  conversationId: string | null = null
) =>
  sendScribeMessage(deps, conversationId, {
    text: value,
    source: 'keyboard',
    entry: 'conversation',
  })

const events = (name: string) =>
  capture.mock.calls
    .filter(([event]) => event === name)
    .map(([, props]) => props)

const timeLog = (minutes = 60, date = TODAY) =>
  call('time_log', {
    date,
    minutes,
    categoryRef: null,
    newCategory: null,
    note: null,
    dateSpoken: 'today',
  })

const plansCreate = (date: string) =>
  call('plans_create', {
    date,
    minutes: 120,
    startMinutes: 9 * 60,
    anytime: false,
    categoryRef: null,
    newCategory: null,
    title: null,
    note: null,
    dateSpoken: 'tomorrow',
    timeSpoken: '9',
    withBuddies: null,
    repeats: false,
  })

beforeEach(() => {
  capture.mockClear()
  stores = fixtureStores()
  now = NOW
  useScribeConversations.setState(
    useScribeConversations.getInitialState(),
    true
  )
  useScribeRuns.setState(useScribeRuns.getInitialState(), true)
  forgoResume()
  useScribeUsageStore.setState(useScribeUsageStore.getInitialState(), true)
  useScribeMemory.setState(useScribeMemory.getInitialState(), true)
})

describe('a turn', () => {
  it('runs a read, sends the next step with its result, and ends on text', async () => {
    const fake = fakeClient([
      () => [
        start(),
        call('plans_list', { from: TODAY, to: '2026-10-27' }),
        done('tool_calls'),
      ],
      () => [
        start(),
        text('You have '),
        text('2 plans this week.'),
        done('end', 4_500),
      ],
    ])
    const id = await send(
      runtime(fake.client),
      'What do I have planned this week?'
    )

    expect(fake.bodies.map((body) => body.step)).toEqual([0, 1])
    const [first, second] = fake.bodies
    expect(first.turnId).toBe(second.turnId)
    expect(first.protocol).toBe(1)
    expect(first.messages.at(-1)?.role).toBe('user')

    const last = second.messages.at(-1)!
    expect(last.role).toBe('tool')
    const result = last.role === 'tool' ? last.content[0] : null
    expect(result).toMatchObject({ name: 'plans_list', ok: true, trust: 'app' })

    expect(JSON.stringify(second.context)).toBe(JSON.stringify(first.context))

    const conversation = getConversation(id)!
    expect(conversation.items.map((item) => item.type)).toEqual([
      'user',
      'assistant',
    ])
    expect(conversation.items[1]).toMatchObject({
      text: 'You have 2 plans this week.',
    })
    expect(conversation.lastInputTokens).toBe(4_500)
    expect(conversation.pendingProposalId).toBeNull()
    expect(getRun(id)).toEqual({ phase: 'idle' })
    expect(events('scribe_turn_finished')).toEqual([
      expect.objectContaining({
        outcome: 'answer',
        steps: 2,
        read_calls: 1,
        write_calls: 0,
      }),
    ])
    expect(useScribeConversations.getState().hasFinishedTurn).toBe(true)
  })

  it('keeps the Developer Tools readout: start time and output tokens', async () => {
    const fake = fakeClient([
      () => [
        start(),
        call('plans_list', { from: TODAY, to: '2026-10-27' }),
        done('tool_calls'),
      ],
      () => [start(), text('Two plans.'), done('end')],
    ])
    const id = await send(runtime(fake.client), 'Plans this week?')

    expect(useScribeRuns.getState().debug[id]).toEqual({
      startedAt: expect.any(Number),

      outputTokens: 100,
      streamedChars: 0,
    })
  })

  it('ends after writes only, with the Proposal for review', async () => {
    const fake = fakeClient([
      () => [start(), text('Logging it.'), timeLog(90), done('tool_calls')],
    ])
    const id = await send(
      runtime(fake.client),
      'Log an hour and a half for today'
    )

    expect(fake.bodies).toHaveLength(1)
    const conversation = getConversation(id)!
    const proposalId = conversation.pendingProposalId!
    const proposal = conversation.proposals[proposalId]
    expect(proposal).toMatchObject({
      status: 'pending',
      invalidCount: 0,
      tainted: false,
    })
    expect(proposal.effects.map((effect) => effect.draft.kind)).toEqual([
      'time.create',
    ])
    expect(proposal.cards).toHaveLength(1)
    expect(conversation.items.map((item) => item.type)).toEqual([
      'user',
      'assistant',
      'proposal',
    ])

    const toolMessage = conversation.messages.at(-1)!
    expect(toolMessage.role === 'tool' && toolMessage.content[0]).toMatchObject(
      {
        ok: true,
        data: { status: 'proposed', proposalId },
      }
    )
    expect(events('scribe_turn_finished')[0]).toMatchObject({
      outcome: 'proposal',
      write_calls: 1,
    })
  })

  it('takes one more step when a new Category waits for the call that uses it', async () => {
    const category = (callId: string) => ({
      ...call('categories_create', { name: 'Hospital', credit: true }),
      callId,
    })
    const fake = fakeClient([
      () => [start(), category('call_cat'), done('tool_calls')],
      () => [
        start(),
        call('time_log', {
          date: TODAY,
          minutes: 180,
          categoryRef: 'nk1',
          newCategory: null,
          note: null,
          dateSpoken: 'today',
        }),
        done('tool_calls'),
      ],
    ])
    const id = await send(
      runtime(fake.client),
      'Log 3 hours of hospital work today, it counts as credit'
    )

    expect(fake.bodies).toHaveLength(2)
    const result = fake.bodies[1].messages.at(-1)!
    expect(result.role === 'tool' && result.content[0]).toMatchObject({
      ok: true,
      data: {
        status: 'proposed',
        ref: 'nk1',
        next: 'Use nk1 now in the calls that need it; the User adds them all together.',
      },
    })
    const conversation = getConversation(id)!
    const proposal = conversation.proposals[conversation.pendingProposalId!]
    expect(proposal.effects.map((effect) => effect.draft.kind)).toEqual([
      'category.create',
      'time.create',
    ])

    const together = fakeClient([
      () => [
        start(),
        category('call_cat'),
        call('time_log', {
          date: TODAY,
          minutes: 180,
          categoryRef: 'nk1',
          newCategory: null,
          note: null,
          dateSpoken: 'today',
        }),
        done('tool_calls'),
      ],
    ])
    await send(runtime(together.client), 'Log 3 hours of hospital work today')
    expect(together.bodies).toHaveLength(1)

    const named = fakeClient([
      () => [
        start(),
        category('call_cat'),
        call('time_log', {
          date: TODAY,
          minutes: 180,
          categoryRef: null,
          newCategory: { name: 'hospital', credit: true },
          note: null,
          dateSpoken: 'today',
        }),
        done('tool_calls'),
      ],
    ])
    const namedId = await send(
      runtime(named.client),
      'Log 3 hours of hospital work today'
    )
    expect(named.bodies).toHaveLength(1)
    const merged = getConversation(namedId)!
    expect(
      merged.proposals[merged.pendingProposalId!].effects.map(
        (effect) => effect.draft.kind
      )
    ).toEqual(['category.create', 'time.create'])
  })

  it('sends the next step after a failed call, and the repair clears the count', async () => {
    const fake = fakeClient([
      () => [start(), timeLog(60, '2026-10-25'), done('tool_calls')],
      () => [start(), timeLog(60), done('tool_calls')],
    ])
    const id = await send(runtime(fake.client), 'Log an hour for Sunday')

    expect(fake.bodies).toHaveLength(2)
    const refused = fake.bodies[1].messages.at(-1)!
    expect(refused.role === 'tool' && refused.content[0]).toMatchObject({
      ok: false,
      error: expect.stringContaining('after today'),
    })
    const conversation = getConversation(id)!
    expect(
      conversation.proposals[conversation.pendingProposalId!].invalidCount
    ).toBe(0)
    expect(events('scribe_turn_finished')[0]).toMatchObject({
      invalid_calls: 1,
    })
  })

  it('counts a write the model never managed to fix', async () => {
    const fake = fakeClient([
      () => [
        start(),
        timeLog(60, '2026-10-25'),
        plansCreate('2026-10-22'),
        done('tool_calls'),
      ],
      () => [start(), text('I planned Thursday.'), done('end')],
    ])
    const id = await send(runtime(fake.client), 'Log Sunday and plan Thursday')
    const conversation = getConversation(id)!
    expect(
      conversation.proposals[conversation.pendingProposalId!].invalidCount
    ).toBe(1)
  })

  it('answers an unknown tool or an invented Ref with an error, then goes on', async () => {
    const fake = fakeClient([
      () => [
        start(),
        call('contacts_delete', { ref: 'c1' }),
        call('contacts_get', { ref: 'c99' }),
        done('tool_calls'),
      ],
      () => [start(), text('Sorry.'), done('end')],
    ])
    await send(runtime(fake.client), 'Delete Ben')
    const results = fake.bodies[1].messages.at(-1)!
    expect(results.role === 'tool' && results.content).toEqual([
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining('Unknown tool'),
      }),
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining('c99'),
      }),
    ])
  })

  it('marks a Proposal made after reading Visit notes as tainted', async () => {
    const fake = fakeClient([
      () => [
        start(),
        call('visits_read_notes', { contactRef: 'c2', limit: 1 }),
        done('tool_calls'),
      ],
      () => [start(), timeLog(30), done('tool_calls')],
    ])
    const id = await send(runtime(fake.client), 'Do what my notes on Maria say')

    const read = fake.bodies[1].messages.at(-1)!
    expect(read.role === 'tool' && read.content[0]).toMatchObject({
      ok: true,
      trust: 'untrusted_text',
    })
    const conversation = getConversation(id)!
    expect(
      conversation.proposals[conversation.pendingProposalId!].tainted
    ).toBe(true)
  })

  it('offers the same tools in data protection mode and refuses Visit notes there', async () => {
    const normal = fakeClient([() => [start(), text('Hi.'), done('end')]])
    await send(runtime(normal.client), 'Hi')
    stores = {
      ...stores,
      preferences: { ...stores.preferences, dataProtectionMode: true },
    }
    const fake = fakeClient([
      () => [
        start(),
        call('visits_read_notes', { contactRef: 'c2', limit: 1 }),
        done('tool_calls'),
      ],
      () => [start(), text('Visit notes are off.'), done('end')],
    ])
    await send(runtime(fake.client), 'What did Maria and I talk about?')

    expect(fake.bodies[0].context.dataProtection).toBe(true)
    expect(JSON.stringify(fake.bodies[0].tools)).toBe(
      JSON.stringify(normal.bodies[0].tools)
    )
    const refused = fake.bodies[1].messages.at(-1)!
    expect(refused.role === 'tool' && refused.content[0]).toMatchObject({
      ok: false,
      error: 'visits_read_notes is off in data protection mode.',
    })
  })

  it('never sends a step at or past maxStepsPerTurn', async () => {
    const read = () => [
      start(),
      call('plans_list', { from: TODAY, to: TODAY }),
      done('tool_calls'),
    ]
    const fake = fakeClient([read, read, read])
    const id = await send(
      runtime(fake.client, { maxStepsPerTurn: 2 }),
      'Keep looking'
    )

    expect(fake.bodies.map((body) => body.step)).toEqual([0, 1])
    expect(getConversation(id)!.items.at(-1)).toMatchObject({
      type: 'notice',
      notice: { kind: 'couldnt_finish' },
    })
  })

  it('drops the calls of a `length` step and shows the too-much notice', async () => {
    const fake = fakeClient([
      () => [start(), text('Adding all of '), timeLog(30), done('length')],
    ])
    const id = await send(runtime(fake.client), 'Add these 40 visits')
    const conversation = getConversation(id)!
    expect(conversation.pendingProposalId).toBeNull()
    expect(conversation.messages.at(-1)).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Adding all of ' }],
    })
    expect(conversation.items.at(-1)).toMatchObject({
      notice: { kind: 'too_much' },
    })
  })

  it('ends a refused step with the refused notice', async () => {
    const fake = fakeClient([() => [start(), done('refused')]])
    const id = await send(runtime(fake.client), 'Something it refuses')
    expect(getConversation(id)!.items.at(-1)).toMatchObject({
      notice: { kind: 'refused' },
    })
  })

  it('maps step_limit to couldnt_finish', async () => {
    const fake = fakeClient([() => [start(), failure('step_limit')]])
    const id = await send(runtime(fake.client), 'Hi')
    expect(getConversation(id)!.items.at(-1)).toMatchObject({
      notice: { kind: 'couldnt_finish' },
    })
  })
})

describe('memory', () => {
  const remember = (note: string | null, old: string | null = null) =>
    call('memory_update', { old, new: note })

  it('sends the memory in the context and saves edits in the background', async () => {
    useScribeMemory.setState({ text: 'Prefers plans at 9:00' })
    stores = fixtureStores({
      memory: { enabled: true, text: 'Prefers plans at 9:00' },
    })
    const fake = fakeClient([
      () => [
        start(),
        text('Got it.'),
        remember('Calls the Saturday group "the car group"'),
        done('tool_calls'),
      ],
    ])
    const id = await send(
      runtime(fake.client),
      'Remember that the car group means my Saturday group'
    )

    expect(fake.bodies).toHaveLength(1)
    expect(fake.bodies[0].context.memory).toEqual(['Prefers plans at 9:00'])
    expect(useScribeMemory.getState().text).toBe(
      'Prefers plans at 9:00\nCalls the Saturday group "the car group"'
    )

    expect(getConversation(id)!.items.map((item) => item.type)).toEqual([
      'user',
      'assistant',
    ])
    expect(events('scribe_memory_saved')).toEqual([
      { added: 1, changed: 0, removed: 0, fill: '<25%' },
    ])
  })

  it('takes one step for a reply after a silent save, once a turn', async () => {
    const fake = fakeClient([
      () => [start(), remember('First'), done('tool_calls')],
      () => [start(), remember('Second'), done('tool_calls')],
    ])
    const id = await send(runtime(fake.client), 'Remember these')
    expect(fake.bodies).toHaveLength(2)
    expect(useScribeMemory.getState().text).toBe('First\nSecond')
    expect(getConversation(id)!.suspended).toBeNull()
  })

  it('applies whole-note edits again over a Settings edit made while the step ran', async () => {
    useScribeMemory.setState({ text: 'Old note' })
    stores = fixtureStores({ memory: { enabled: true, text: 'Old note' } })
    const fake = fakeClient([
      () => [
        start(),
        text('Done.'),
        remember('From the model'),
        remember(null, 'Old note'),

        remember('a', 'the'),
        () => useScribeMemory.setState({ text: 'From Settings\nOld note' }),
        done('tool_calls'),
      ],
    ])
    await send(runtime(fake.client), 'Remember this')
    expect(fake.bodies).toHaveLength(1)
    expect(useScribeMemory.getState().text).toBe(
      'From Settings\nFrom the model'
    )

    expect(events('scribe_memory_saved')).toEqual([
      { added: 1, changed: 0, removed: 1, fill: '<25%' },
    ])
  })

  it("saves nothing from a step that isn't kept", async () => {
    const fake = fakeClient([
      () => [start(), remember('Half a thought'), done('length')],
    ])
    await send(runtime(fake.client), 'Remember this')
    expect(useScribeMemory.getState().text).toBe('')
    expect(events('scribe_memory_saved')).toEqual([])
  })

  it('sends null while memory is off', async () => {
    stores = fixtureStores({ memory: { enabled: false, text: 'Hidden' } })
    const fake = fakeClient([() => [start(), text('Hi.'), done('end')]])
    await send(runtime(fake.client), 'Hello')
    expect(fake.bodies[0].context.memory).toBeNull()
  })
})

describe('calls as they stream', () => {
  const drafting = (id: string) => useScribeRuns.getState().drafting[id] ?? null
  const contactsCreate = (name: string) =>
    call('contacts_create', { name, address: null, phone: null, email: null })

  it("shows each write's card before the step ends, under the item it keeps", async () => {
    const seen: string[][] = []
    const probe = () =>
      seen.push(
        drafting('conversation-draft')?.cards.map((card) => card.kind) ?? []
      )
    const fake = fakeClient([
      () => [
        start(),
        probe,
        timeLog(60),
        probe,
        plansCreate('2026-10-22'),
        probe,
        done('tool_calls'),
      ],
    ])
    await send(
      runtime(fake.client),
      'Log an hour, plan tomorrow',
      'conversation-draft'
    )

    expect(seen).toEqual([[], ['time'], ['time', 'plan']])
    const conversation = getConversation('conversation-draft')!
    const proposal = conversation.proposals[conversation.pendingProposalId!]
    expect(proposal.cards.map((card) => card.kind)).toEqual(['time', 'plan'])

    expect(conversation.items.at(-1)).toMatchObject({
      type: 'proposal',
      id: `${proposal.id}-item`,
    })
    expect(drafting('conversation-draft')).toBeNull()
  })

  it('starts a read when its call arrives, before the step ends', async () => {
    const ran: string[] = []
    const deps = runtime(
      fakeClient([
        () => [
          start(),
          call('plans_list', { from: TODAY, to: TODAY }),
          () => ran.push('after the call'),
          done('tool_calls'),
        ],
        () => [start(), text('Nothing planned.'), done('end')],
      ]).client
    )
    const tool = deps.tool
    deps.tool = (name) => {
      const found = tool(name)
      if (!found || found.access !== 'read') return found
      return {
        ...found,
        run: (args, ctx) => {
          ran.push(name)
          return found.run(args, ctx)
        },
      }
    }
    await send(deps, 'What do I have today?')
    expect(ran).toEqual(['plans_list', 'after the call'])
  })

  it('takes back what a `length` step proposed, Refs included', async () => {
    const fake = fakeClient([
      () => [
        start(),
        contactsCreate('Ana Silva'),
        () => expect(drafting('conversation-length')?.cards).toHaveLength(1),
        done('length'),
      ],
    ])
    await send(
      runtime(fake.client),
      'Add these 40 people',
      'conversation-length'
    )

    const conversation = getConversation('conversation-length')!
    expect(conversation.pendingProposalId).toBeNull()
    expect(Object.keys(conversation.proposals)).toEqual([])
    expect(conversation.refs.byRef.n1).toBeUndefined()
    expect(conversation.refs.next.n).toBe(1)
    expect(drafting('conversation-length')).toBeNull()
  })

  it("starts a dropped stream's replay over: no second card, no orphan Ref", async () => {
    const fake = fakeClient([
      () => [
        start(),
        contactsCreate('Ana Silva'),
        timeLog(60),

        start(),
        contactsCreate('Ana Silva'),
        done('tool_calls'),
      ],
    ])
    await send(runtime(fake.client), 'Add Ana Silva', 'conversation-replay')

    const conversation = getConversation('conversation-replay')!
    const proposal = conversation.proposals[conversation.pendingProposalId!]
    expect(proposal.effects.map((effect) => effect.draft)).toEqual([
      expect.objectContaining({ kind: 'contact.create', ref: 'n1' }),
    ])
    expect(proposal.cards).toHaveLength(1)
    expect(conversation.refs.byRef.n2).toBeUndefined()

    const [assistant, tool] = conversation.messages.slice(-2)
    expect(assistant.role === 'assistant' && assistant.content).toHaveLength(1)
    expect(tool.role === 'tool' && tool.content).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ ref: 'n1' }) }),
    ])
  })

  it("keeps earlier steps' cards when a later step is stopped", async () => {
    let streamed!: () => void
    const midway = new Promise<void>((resolve) => (streamed = resolve))
    const fake = fakeClient([
      () => [
        start(),
        timeLog(60),
        call('plans_list', { from: TODAY, to: TODAY }),
        done('tool_calls'),
      ],
    ])

    const client: ScribeClient = {
      ...fake.client,
      step: async (body, options) => {
        if (body.step === 0) return fake.client.step(body, options)
        options.onEvent(start())
        options.onEvent(contactsCreate('Ana Silva'))
        streamed()
        return new Promise((_resolve, reject) =>
          options.signal?.addEventListener('abort', () =>
            reject(new ScribeClientError('cancelled'))
          )
        )
      },
    }
    const turn = send(
      runtime(client),
      'Log an hour, add Ana',
      'conversation-cancel'
    )
    await midway
    expect(drafting('conversation-cancel')?.cards).toHaveLength(2)
    abortTurn('conversation-cancel')
    await turn

    const conversation = getConversation('conversation-cancel')!
    const proposal = conversation.proposals[conversation.pendingProposalId!]
    expect(proposal.effects.map((effect) => effect.draft.kind)).toEqual([
      'time.create',
    ])
    expect(conversation.refs.byRef.n1).toBeUndefined()
    expect(drafting('conversation-cancel')).toBeNull()
  })

  it("drops a failed step's calls, so Try again proposes them once", async () => {
    const fake = fakeClient([
      () => [
        start(),
        timeLog(60),
        call('plans_list', { from: TODAY, to: TODAY }),
        done('tool_calls'),
      ],
      () => [start(), contactsCreate('Ana Silva'), failure('model_error')],
    ])
    const deps = runtime(fake.client)
    const id = await send(deps, 'Log an hour and add Ana')
    let conversation = getConversation(id)!
    const proposalId = conversation.pendingProposalId!
    expect(
      conversation.proposals[proposalId].effects.map((e) => e.draft.kind)
    ).toEqual(['time.create'])
    expect(conversation.refs.byRef.n1).toBeUndefined()

    fake.steps.push(() => [
      start(),
      contactsCreate('Ana Silva'),
      done('tool_calls'),
    ])
    await retryScribeTurn(deps, id)
    conversation = getConversation(id)!
    expect(
      conversation.proposals[proposalId].effects.map((e) => e.draft)
    ).toEqual([
      expect.objectContaining({ kind: 'time.create' }),
      expect.objectContaining({ kind: 'contact.create', ref: 'n1' }),
    ])
    expect(
      conversation.items.filter((item) => item.type === 'proposal')
    ).toHaveLength(1)
  })

  it('keeps a card the User unchecked while the turn ran', async () => {
    const fake = fakeClient([
      () => [
        start(),
        timeLog(60),
        plansCreate('2026-10-22'),
        () => {
          const draft = drafting('conversation-toggle')!
          toggleProposalCard(draft.id, draft.cards[1].id)
        },
        done('tool_calls'),
      ],
    ])
    await send(
      runtime(fake.client),
      'Log an hour, plan tomorrow',
      'conversation-toggle'
    )
    const conversation = getConversation('conversation-toggle')!
    const proposal = conversation.proposals[conversation.pendingProposalId!]
    expect(proposal.cards.map((card) => card.selected)).toEqual([true, false])
  })
})

describe('across turns', () => {
  it('withdraws a pending Proposal and reports it first in the next message', async () => {
    const fake = fakeClient([
      () => [start(), timeLog(60), done('tool_calls')],
      () => [start(), timeLog(90), done('tool_calls')],
    ])
    const deps = runtime(fake.client)
    const id = await send(deps, 'Log an hour')
    const firstProposal = getConversation(id)!.pendingProposalId!
    await send(deps, 'Make it an hour and a half', id)

    const conversation = getConversation(id)!
    expect(conversation.proposals[firstProposal].status).toBe('superseded')
    expect(conversation.pendingProposalId).not.toBe(firstProposal)
    const message = fake.bodies[1].messages.at(-1) as UserMessage
    expect(message.content[0]).toMatchObject({
      type: 'proposal_outcome',
      proposalId: firstProposal,
      outcome: 'superseded',
      applied: [],
    })
    expect(message.content.at(-1)).toEqual({
      type: 'text',
      text: 'Make it an hour and a half',
    })
    expect(events('scribe_proposal_resolved')).toEqual([
      expect.objectContaining({ outcome: 'superseded', cards: 1 }),
    ])
    expect(events('scribe_turn_started')[1]).toMatchObject({
      pending_proposal: true,
      turn: '2',
    })
  })

  it('replaces a message that failed before any answer, keeping what it reported', async () => {
    const fake = fakeClient([
      () => [start(), timeLog(60), done('tool_calls')],
      () => [start(), failure('model_error')],
      () => [start(), text('Planned.'), done('end')],
    ])
    const deps = runtime(fake.client)
    const id = await send(deps, 'Log an hour')
    const firstProposal = getConversation(id)!.pendingProposalId!
    await send(deps, 'Make it two hours', id)
    expect(getRun(id)).toMatchObject({ error: { code: 'model_error' } })

    await send(deps, 'Plan two hours tomorrow at 9', id)

    const messages = fake.bodies[2].messages
    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
    ])
    expect((messages[3] as UserMessage).content).toEqual([
      expect.objectContaining({
        type: 'proposal_outcome',
        proposalId: firstProposal,
        outcome: 'superseded',
      }),
      { type: 'text', text: 'Plan two hours tomorrow at 9' },
    ])

    expect(
      getConversation(id)!
        .items.filter((item) => item.type === 'user')
        .map((item) => item.type === 'user' && item.text)
    ).toEqual([
      'Log an hour',
      'Make it two hours',
      'Plan two hours tomorrow at 9',
    ])
  })

  it('replaces a turn that failed partway with nothing to review', async () => {
    const fake = fakeClient([
      () => [
        start(),
        call('plans_list', { from: TODAY, to: TODAY }),
        done('tool_calls'),
      ],
      () => [start(), failure('model_error')],
      () => [start(), text('Hi'), done('end')],
    ])
    const deps = runtime(fake.client)
    const id = await send(deps, 'What do I have today?')
    expect(getConversation(id)!.suspended).toMatchObject({ step: 1 })

    await send(deps, 'Never mind, hello', id)

    expect(fake.bodies[2].step).toBe(0)
    expect(fake.bodies[2].messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: [{ type: 'text', text: 'Never mind, hello' }],
      }),
    ])
  })

  it('replaces a message stopped before any answer', async () => {
    let started!: () => void
    const running = new Promise<void>((resolve) => (started = resolve))
    const fake = fakeClient([
      (_body, signal) =>
        new Promise<StepStreamEvent[]>((_resolve, reject) => {
          started()
          signal?.addEventListener('abort', () =>
            reject(new ScribeClientError('cancelled'))
          )
        }),
      () => [start(), text('Logged.'), done('end')],
    ])
    const deps = runtime(fake.client)
    const turn = send(deps, 'Log two hours', 'conversation-replace')
    await running
    abortTurn('conversation-replace')
    await turn

    await send(deps, 'Log three hours', 'conversation-replace')

    expect(
      fake.bodies[1].messages.map((message) =>
        message.content.map((block) => block.type === 'text' && block.text)
      )
    ).toEqual([['Log three hours']])
  })

  it('keeps a failed turn whose cards are showing, and withdraws them', async () => {
    const fake = fakeClient([
      () => [
        start(),
        timeLog(60),
        call('plans_list', { from: TODAY, to: TODAY }),
        done('tool_calls'),
      ],
      () => [start(), failure('model_error')],
      () => [start(), timeLog(120), done('tool_calls')],
    ])
    const deps = runtime(fake.client)
    const id = await send(deps, 'Log an hour and check today')
    const proposalId = getConversation(id)!.pendingProposalId!

    await send(deps, 'Make it two hours', id)

    const messages = fake.bodies[2].messages
    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
    ])
    expect((messages[3] as UserMessage).content[0]).toMatchObject({
      type: 'proposal_outcome',
      proposalId,
      outcome: 'superseded',
    })
  })

  it('rebuilds the context on a new day and keeps the Refs', async () => {
    const fake = fakeClient([
      () => [start(), text('Hi'), done('end')],
      () => [start(), text('Hi again'), done('end')],
    ])
    const deps = runtime(fake.client)
    const id = await send(deps, 'Hello')
    now = new Date(2026, 9, 22, 8, 0)
    await send(deps, 'Morning', id)
    const [first, second] = fake.bodies
    expect(first.context.days[7]).toBe('Wed 2026-10-21')
    expect(second.context.days[7]).toBe('Thu 2026-10-22')

    expect(second.context.contacts).toEqual(first.context.contacts)
  })

  it('refuses text over maxUserTextChars without sending, keeping the outcomes', async () => {
    const fake = fakeClient([() => [start(), timeLog(60), done('tool_calls')]])
    const deps = runtime(fake.client, { maxUserTextChars: 20 })
    const id = await send(deps, 'Log an hour')
    await send(deps, 'x'.repeat(21), id)
    expect(fake.bodies).toHaveLength(1)
    expect(getRun(id)).toMatchObject({
      phase: 'error',
      error: { code: 'too_large' },
    })
    expect(getConversation(id)!.outcomes).toEqual([
      expect.objectContaining({ outcome: 'superseded' }),
    ])
  })
})

describe('stopping and failures', () => {
  it('stops a running step, keeping the user message', async () => {
    let started!: () => void
    const running = new Promise<void>((resolve) => (started = resolve))
    const fake = fakeClient([
      (_body, signal) =>
        new Promise<StepStreamEvent[]>((_resolve, reject) => {
          started()
          signal?.addEventListener('abort', () =>
            reject(new ScribeClientError('cancelled'))
          )
        }),
    ])
    const deps = runtime(fake.client)
    const turn = send(deps, 'Plan my week', 'conversation-stop')
    await running
    abortTurn('conversation-stop')
    await turn

    const conversation = getConversation('conversation-stop')!
    expect(conversation.items.map((item) => item.type)).toEqual(['user'])
    expect(conversation.messages.at(-1)?.role).toBe('user')
    expect(conversation.suspended).toBeNull()
    expect(getRun('conversation-stop')).toEqual({ phase: 'idle' })
    expect(events('scribe_turn_finished')[0]).toMatchObject({
      outcome: 'stopped',
    })
    expect(useScribeConversations.getState().hasFinishedTurn).toBe(false)
  })

  it('retries the failed step as the same turn, keeping the draft', async () => {
    const fake = fakeClient([
      () => [
        start(),
        timeLog(60),
        call('plans_list', { from: TODAY, to: TODAY }),
        done('tool_calls'),
      ],
      () => [start(), failure('model_error')],
    ])
    const deps = runtime(fake.client)
    const id = await send(deps, 'Log an hour and plan tomorrow')

    let conversation = getConversation(id)!
    expect(getRun(id)).toMatchObject({
      phase: 'error',
      error: { code: 'model_error', retryable: true },
    })
    expect(conversation.suspended).toMatchObject({ step: 1 })

    const proposalId = conversation.pendingProposalId!
    expect(conversation.proposals[proposalId].effects).toHaveLength(1)
    expect(events('scribe_turn_finished')[0]).toMatchObject({
      outcome: 'error',
      error_code: 'model_error',
    })

    fake.steps.push(() => [
      start(),
      plansCreate('2026-10-22'),
      done('tool_calls'),
    ])
    await retryScribeTurn(deps, id)

    expect(fake.bodies.map((body) => [body.turnId, body.step])).toEqual([
      [fake.bodies[0].turnId, 0],
      [fake.bodies[0].turnId, 1],
      [fake.bodies[0].turnId, 1],
    ])
    conversation = getConversation(id)!
    expect(conversation.suspended).toBeNull()
    expect(conversation.pendingProposalId).toBe(proposalId)
    expect(
      conversation.proposals[proposalId].effects.map(
        (effect) => effect.draft.kind
      )
    ).toEqual(['time.create', 'plan.create'])
    expect(
      conversation.items.filter((item) => item.type === 'proposal')
    ).toHaveLength(1)
  })

  it('shows the limit notice and keeps the meter from limit_reached', async () => {
    const meter: UsageSnapshotWire = {
      plan: 'free',
      supporterCheckFailed: false,
      windows: [
        { id: 'monthly', percentUsed: 100, resetsAt: 1_900_000_000_000 },
      ],
      limited: true,
      resetsAt: 1_900_000_000_000,
      asOf: 1_800_000_000_000,
    }
    const fake = fakeClient([() => [failure('limit_reached', meter)]])
    const id = await send(runtime(fake.client), 'Log an hour')
    expect(getConversation(id)!.items.at(-1)).toMatchObject({
      notice: {
        kind: 'limit_reached',
        plan: 'free',
        resetsAt: 1_900_000_000_000,
      },
    })
    expect(useScribeUsageStore.getState().snapshot).toEqual(meter)
    expect(events('scribe_limit_reached')).toEqual([
      { plan: 'free', window: 'monthly' },
    ])
    expect(events('scribe_turn_finished')[0]).toMatchObject({
      outcome: 'limit',
    })
  })

  it('marks the conversation full on context_full', async () => {
    const fake = fakeClient([() => [failure('context_full')]])
    const id = await send(runtime(fake.client), 'Hello')
    expect(getConversation(id)!.contextFull).toBe(true)
    expect(getRun(id)).toMatchObject({
      phase: 'error',
      error: { code: 'context_full' },
    })
    expect(events('scribe_context_full')).toEqual([{ state: 'full' }])
  })

  it('refuses to send once the estimate is over 90 % of maxInputTokens', async () => {
    const fake = fakeClient([() => [start(), text('Hi'), done('end', 9_500)]])
    const deps = runtime(fake.client, { maxInputTokens: 10_000 })
    const id = await send(deps, 'Hello')
    await send(deps, 'Again', id)
    expect(fake.bodies).toHaveLength(1)
    expect(getRun(id)).toMatchObject({ error: { code: 'context_full' } })
  })

  it('reports device gates to the app', async () => {
    const fake = fakeClient([() => [failure('suspended')]])
    const deps = runtime(fake.client)
    await send(deps, 'Hello')
    expect(deps.onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'suspended' })
    )
  })

  it('keeps a step that was running when the app closed, for Try again', async () => {
    const fake = fakeClient([
      () => new Promise<StepStreamEvent[]>(() => undefined),
    ])
    void send(runtime(fake.client), 'Log an hour', 'conversation-closed')
    await vi.waitFor(() => expect(fake.bodies).toHaveLength(1))
    expect(getConversation('conversation-closed')!.suspended).toMatchObject({
      step: 0,
    })
  })
})

describe('reconnecting', () => {
  const offline = (): FakeStep => () => {
    throw new ScribeClientError('network')
  }

  it('goes on with a turn that stopped offline once the connection is back', async () => {
    const fake = fakeClient([
      offline(),
      () => [start(), timeLog(60), done('tool_calls')],
    ])
    const deps = runtime(fake.client)
    const id = await send(deps, 'Log an hour')
    expect(getRun(id)).toMatchObject({ error: { code: 'network' } })

    await resumeAfterReconnect(deps)

    expect(fake.bodies.map((body) => [body.turnId, body.step])).toEqual([
      [fake.bodies[0].turnId, 0],
      [fake.bodies[0].turnId, 0],
    ])
    expect(getRun(id)).toEqual({ phase: 'idle' })
    expect(getConversation(id)!.pendingProposalId).not.toBeNull()
  })

  it('goes on at most once per failure', async () => {
    const fake = fakeClient([offline(), offline()])
    const deps = runtime(fake.client)
    const id = await send(deps, 'Log an hour')

    await Promise.all([resumeAfterReconnect(deps), resumeAfterReconnect(deps)])
    expect(fake.bodies).toHaveLength(2)
    expect(getRun(id)).toMatchObject({ error: { code: 'network' } })

    fake.steps.push(() => [start(), text('Done.'), done('end')])
    await resumeAfterReconnect(deps)
    await resumeAfterReconnect(deps)
    expect(fake.bodies).toHaveLength(3)
    expect(getRun(id)).toEqual({ phase: 'idle' })
  })

  it('leaves other failures for Try again', async () => {
    const fake = fakeClient([
      () => [start(), failure('model_error')],
      () => [start(), failure('server_error')],
    ])
    const deps = runtime(fake.client)
    const broken = await send(deps, 'Log an hour')
    const unavailable = await send(deps, 'Plan tomorrow')

    await resumeAfterReconnect(deps)

    expect(fake.bodies).toHaveLength(2)
    expect(getRun(broken)).toMatchObject({ error: { code: 'model_error' } })
    expect(getRun(unavailable)).toMatchObject({
      error: { code: 'unavailable' },
    })
  })

  it('stays put once the User tried again, typed, or sent something else', async () => {
    const fake = fakeClient([
      offline(),
      () => [start(), text('Hi'), done('end')],
    ])
    const deps = runtime(fake.client)
    const id = await send(deps, 'Log an hour')
    await retryScribeTurn(deps, id)
    await resumeAfterReconnect(deps)
    expect(fake.bodies).toHaveLength(2)

    fake.steps.push(offline())
    const typed = await send(deps, 'Plan tomorrow')
    forgoResume()
    await resumeAfterReconnect(deps)
    expect(fake.bodies).toHaveLength(3)
    expect(getRun(typed)).toMatchObject({ error: { code: 'network' } })

    fake.steps.push(offline(), () => [start(), text('Hello'), done('end')])
    const left = await send(deps, 'Log two hours')
    await send(deps, 'Hello', null)
    await resumeAfterReconnect(deps)
    expect(fake.bodies).toHaveLength(5)
    expect(getRun(left)).toMatchObject({ error: { code: 'network' } })
  })

  it('never runs alongside a turn already going', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const fake = fakeClient([
      offline(),
      async () => {
        await held
        return [start(), text('Done.'), done('end')]
      },
    ])
    const deps = runtime(fake.client)
    const id = await send(deps, 'Log an hour')
    const retry = retryScribeTurn(deps, id)
    await vi.waitFor(() => expect(fake.bodies).toHaveLength(2))

    await resumeAfterReconnect(deps)
    release()
    await retry

    expect(fake.bodies).toHaveLength(2)
  })
})
