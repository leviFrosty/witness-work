import {
  DEFAULT_SCRIBE_LIMITS,
  type ScribeContextWire,
  type ScribeStatusWire,
  type StepRequest,
  type StepStreamEvent,
  type StepTerminalEvent,
  type UsageSnapshotWire,
} from '@/features/scribe/lib/wire'
import type { ScribeClient } from '@/features/scribe/lib/scribeClient'
import { ScribeClientError } from '@/features/scribe/lib/errors'
import { getOnline, simulateOffline } from '@/lib/http/online'

/**
 * A fake Scribe AI server for the verify harness and Tools (dev builds only):
 * answers status, usage, steps and page reads on the device, so every Scribe
 * state can be reached without ww-api or a model. Steps come from a queue of
 * scripted steps; with the queue empty a step answers in text.
 */

/** One step's events (terminal last), built from the request. */
export type FakeStep = (body: StepRequest) => StepStreamEvent[]

const DEFAULT_TOKENS = 3_000

let callSeq = 0
const callId = () => `call_${++callSeq}`

const done = (
  finish: Extract<StepTerminalEvent, { type: 'done' }>['finish'],
  meter: UsageSnapshotWire | null,
  inputTokens = DEFAULT_TOKENS
): StepStreamEvent => ({
  type: 'done',
  finish,
  usage: {
    inputTokens,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 120,
    reasoningTokens: 0,
    units: 1_500,
  },
  meter,
})

const start = (body: StepRequest): StepStreamEvent => ({
  type: 'start',
  offered: body.tools.map((tool) => tool.name),
  dropped: [],
})

/** Today's date as the context names it ("Wed 2026-10-21" → 2026-10-21). */
const today = (context: ScribeContextWire): string =>
  context.days[7]?.slice(4) ?? context.now.slice(0, 10)
const dayOffset = (context: ScribeContextWire, offset: number): string =>
  context.days[7 + offset]?.slice(4) ?? today(context)

/** Refs of context contacts whose name starts with `first`. */
const contactRefsNamed = (
  context: ScribeContextWire,
  first: string
): string[] =>
  context.contacts
    .map((line) => line.split(' '))
    .filter(([, name]) => name?.toLowerCase() === first.toLowerCase())
    .map(([ref]) => ref)

/** The ref of the context contact with exactly this name. */
const contactRefByName = (
  context: ScribeContextWire,
  name: string
): string | null => {
  const line = context.contacts.find(
    (entry) => entry.slice(entry.indexOf(' ') + 1) === name
  )
  return line ? line.slice(0, line.indexOf(' ')) : null
}

/** The first context line's ref whose text includes `part`. */
const refIn = (lines: string[], part: string): string | null => {
  const line = lines.find((entry) => entry.includes(part))
  return line ? line.slice(0, line.indexOf(' ')) : null
}

/**
 * The next pending Ref of a kind (`n`, `nk`): one past the highest the
 * conversation has seen, as the device mints them.
 */
const nextPending = (body: StepRequest, kind: 'n' | 'nk'): string => {
  const seen = JSON.stringify(body.messages).match(
    new RegExp(`\\b${kind}(\\d+)\\b`, 'g')
  )
  const highest = Math.max(
    0,
    ...(seen ?? []).map((ref) => Number(ref.slice(kind.length)))
  )
  return `${kind}${highest + 1}`
}

/** The next `weekday` after today, from the context's days. */
const nextWeekday = (context: ScribeContextWire, weekday: string): string =>
  context.days
    .slice(8)
    .find((day) => day.startsWith(weekday))
    ?.slice(4) ?? dayOffset(context, 7)

/** A tool call the fake makes. */
export interface FakeCall {
  name: string
  args: Record<string, unknown>
}

/** One step that makes `calls` and ends the turn for review. */
export const callsStep =
  (calls: (body: StepRequest) => FakeCall[], text?: string): FakeStep =>
  (body) => [
    start(body),
    ...(text ? words(text) : []),
    ...calls(body).map((call) => ({
      type: 'tool_call' as const,
      callId: callId(),
      name: call.name,
      args: call.args,
    })),
    done('tool_calls', fake.usage),
  ]

const words = (text: string): StepStreamEvent[] =>
  text.split(/(?<= )/).map((delta) => ({ type: 'text' as const, delta }))

/** The usage snapshot the fake reports. */
export const fakeUsage = (
  change: Partial<UsageSnapshotWire> = {}
): UsageSnapshotWire => ({
  plan: 'free',
  supporterCheckFailed: false,
  windows: [
    {
      id: 'monthly',
      percentUsed: 12,
      resetsAt: Date.now() + 20 * 86_400_000,
      units: { used: 36_000, limit: 300_000 },
    },
  ],
  limited: false,
  resetsAt: null,
  asOf: Date.now(),
  ...change,
})

export const fakeStatus = (
  change: Partial<ScribeStatusWire> = {}
): ScribeStatusWire => ({
  enabled: true,
  reason: null,
  protocol: { min: 1, max: 1 },
  minAppVersion: null,
  disabledTools: [],
  limits: DEFAULT_SCRIBE_LIMITS,
  ...change,
})

/**
 * Canned turns, each a list of steps. Write steps end the turn (writes only),
 * so the Proposal shows for review.
 */
export const FAKE_SCRIPTS = {
  /** Plain text. */
  answer: (): FakeStep[] => [
    (body) => [
      start(body),
      ...words('You have 2 hours planned this week and 5 hours logged so far.'),
      done('end', fake.usage),
    ],
  ],
  /** One write: an hour logged today. */
  logTime: (): FakeStep[] => [
    (body) => [
      start(body),
      ...words('I can log that for you.'),
      {
        type: 'tool_call',
        callId: callId(),
        name: 'time_log',
        args: {
          date: today(body.context),
          minutes: 60,
          categoryRef: null,
          newCategory: null,
          note: null,
          dateSpoken: 'today',
        },
      },
      done('tool_calls', fake.usage),
    ],
  ],
  /** A read, then two writes: plans_list → plans_create + time_log. */
  planAndLog: (): FakeStep[] => [
    (body) => [
      start(body),
      {
        type: 'tool_call',
        callId: callId(),
        name: 'plans_list',
        args: { from: today(body.context), to: dayOffset(body.context, 6) },
      },
      done('tool_calls', fake.usage),
    ],
    (body) => [
      start(body),
      ...words('Here is a plan for tomorrow and the time from today.'),
      {
        type: 'tool_call',
        callId: callId(),
        name: 'plans_create',
        args: {
          date: dayOffset(body.context, 1),
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
        },
      },
      {
        type: 'tool_call',
        callId: callId(),
        name: 'time_log',
        args: {
          date: today(body.context),
          minutes: 90,
          categoryRef: null,
          newCategory: null,
          note: null,
          dateSpoken: 'today',
        },
      },
      done('tool_calls', fake.usage),
    ],
  ],
  /**
   * A Visit with "Maria": a choice card when two context contacts are named
   * Maria, else a new Contact. Follow-up next week.
   */
  visitMaria: (): FakeStep[] => [
    (body) => {
      const marias = contactRefsNamed(body.context, 'Maria')
      return [
        start(body),
        {
          type: 'tool_call',
          callId: callId(),
          name: 'visits_log',
          args: {
            contactRef: marias.length === 1 ? marias[0] : null,
            newContact:
              marias.length === 0
                ? { name: 'Maria', address: null, phone: null }
                : null,
            askBetween:
              marias.length > 1
                ? { spokenName: 'Maria', refs: marias.slice(0, 5) }
                : null,
            date: today(body.context),
            notAtHome: false,
            bibleStudy: false,
            note: 'Talked about the hope for the future.',
            dateSpoken: 'today',
            followUp: {
              date: dayOffset(body.context, 7),
              topic: 'Bring the brochure',
              dateSpoken: 'next week',
            },
          },
        },
        done('tool_calls', fake.usage),
      ]
    },
  ],
  /**
   * Every kind of write in one Proposal, for the `pioneer` scenario: a credit
   * Category and time in it, time with a note and in LDC, a timed and an
   * anytime Plan, a change to the first Plan, a new Contact with a long name
   * and a Visit with a Follow-up, a change to Ada Reyes, a Bible study with
   * Bruno Okafor, and a Not at Home for a new "Chen Wei" (a choice, since one
   * exists).
   */
  everyKind: (): FakeStep[] => [
    callsStep((body) => {
      const { context } = body
      const category = nextPending(body, 'nk')
      const person = nextPending(body, 'n')
      const tuesday = nextWeekday(context, 'Tue')
      const friday = nextWeekday(context, 'Fri')
      const followUpTopic = 'Bring the brochure about the hope for the future'
      return [
        {
          name: 'categories_create',
          args: { name: 'Hospital witnessing', credit: true },
        },
        {
          name: 'time_log',
          args: {
            date: dayOffset(context, -1),
            minutes: 75,
            categoryRef: category,
            newCategory: null,
            note: null,
            dateSpoken: 'yesterday',
          },
        },
        {
          name: 'time_log',
          args: {
            date: today(context),
            minutes: 120,
            categoryRef: null,
            newCategory: null,
            note: 'Cart witnessing at the train station',
            dateSpoken: 'this morning',
          },
        },
        {
          name: 'time_log',
          args: {
            date: today(context),
            minutes: 45,
            categoryRef: refIn(context.categories, 'LDC'),
            note: null,
            dateSpoken: null,
          },
        },
        {
          name: 'plans_create',
          args: {
            date: tuesday,
            minutes: 90,
            startMinutes: 18 * 60,
            anytime: false,
            categoryRef: null,
            newCategory: null,
            title: 'Evening return visits',
            note: null,
            dateSpoken: 'next Tuesday',
            timeSpoken: 'at 6 pm',
          },
        },
        {
          name: 'plans_create',
          args: {
            date: friday,
            minutes: 60,
            startMinutes: null,
            anytime: true,
            categoryRef: null,
            newCategory: null,
            title: null,
            note: null,
            dateSpoken: 'Friday',
            timeSpoken: null,
          },
        },
        {
          name: 'plans_update',
          args: {
            planRef: context.plans[0]?.split(' ')[0] ?? 'p1',
            onDate: null,
            date: null,
            minutes: 180,
            startMinutes: 10 * 60,
            anytime: false,
            title: 'Cart witnessing downtown',
            note: null,
            dateSpoken: null,
            timeSpoken: 'at 10',
          },
        },
        {
          name: 'contacts_create',
          args: {
            name: 'Maximiliano Bartholomew Fitzgerald-Okonkwo',
            address: {
              line1: '12345 Extraordinarily Long Boulevard, Apartment 1209B',
              city: 'South San Francisco',
              state: 'CA',
              zip: '94080',
              country: null,
            },
            phone: '+1 415 555 0199',
            email: 'max.fitzgerald-okonkwo@example.com',
          },
        },
        {
          name: 'visits_log',
          args: {
            contactRef: person,
            newContact: null,
            askBetween: null,
            date: today(context),
            notAtHome: false,
            bibleStudy: false,
            note: 'Interested in the brochure; asked about the resurrection',
            dateSpoken: 'today',
            followUp: {
              date: tuesday,
              topic: followUpTopic,
              dateSpoken: 'next Tuesday',
            },
          },
        },
        {
          name: 'contacts_update',
          args: {
            contactRef: contactRefByName(context, 'Ada Reyes') ?? 'c1',
            name: null,
            phone: '+1 415 555 0100',
            email: 'ada.reyes@example.com',
            address: {
              line1: '200 Market St',
              city: null,
              state: null,
              zip: null,
              country: null,
            },
          },
        },
        {
          name: 'visits_log',
          args: {
            contactRef: contactRefByName(context, 'Bruno Okafor') ?? 'c2',
            newContact: null,
            askBetween: null,
            date: today(context),
            notAtHome: false,
            bibleStudy: true,
            note: 'Lesson 4',
            dateSpoken: 'today',
            followUp: {
              date: dayOffset(context, 7),
              topic: 'Lesson 5',
              dateSpoken: 'next week',
            },
          },
        },
        {
          name: 'visits_log',
          args: {
            contactRef: null,
            newContact: { name: 'Chen Wei', address: null, phone: null },
            askBetween: null,
            date: dayOffset(context, -1),
            notAtHome: true,
            bibleStudy: false,
            note: null,
            dateSpoken: 'yesterday',
            followUp: null,
          },
        },
      ]
    }, 'Here is everything from your update.'),
  ],
  /** A call the app refuses, then the model's fix (a failed call → step + 1). */
  repair: (): FakeStep[] => [
    (body) => [
      start(body),
      {
        type: 'tool_call',
        callId: callId(),
        name: 'time_log',
        args: {
          date: dayOffset(body.context, 3),
          minutes: 30,
          categoryRef: null,
          newCategory: null,
          note: null,
          dateSpoken: 'Saturday',
        },
      },
      done('tool_calls', fake.usage),
    ],
    (body) => [
      start(body),
      {
        type: 'tool_call',
        callId: callId(),
        name: 'plans_create',
        args: {
          date: dayOffset(body.context, 3),
          minutes: 30,
          startMinutes: null,
          anytime: true,
          categoryRef: null,
          newCategory: null,
          title: null,
          note: null,
          dateSpoken: 'Saturday',
          timeSpoken: null,
          withBuddies: null,
          repeats: false,
        },
      },
      done('tool_calls', fake.usage),
    ],
  ],
  /** `finish: length`: the "too much at once" notice. */
  tooMuch: (): FakeStep[] => [
    (body) => [
      start(body),
      ...words('Let me add all of '),
      done('length', fake.usage),
    ],
  ],
  /** `finish: refused`. */
  refused: (): FakeStep[] => [
    (body) => [start(body), done('refused', fake.usage)],
  ],
  /** A full usage window: `limit_reached` with the meter. */
  limit: (): FakeStep[] => [
    () => {
      const meter = fakeUsage({
        limited: true,
        resetsAt: Date.now() + 3 * 86_400_000,
        windows: [
          {
            id: 'monthly',
            percentUsed: 100,
            resetsAt: Date.now() + 3 * 86_400_000,
            units: { used: 300_000, limit: 300_000 },
          },
        ],
      })
      fake.usage = meter
      return [
        {
          type: 'error',
          code: 'limit_reached',
          message: 'Usage limit reached',
          retryable: false,
          meter,
        },
      ]
    },
  ],
  /** The model failed: an error row with Try again. */
  modelError: (): FakeStep[] => [
    (body) => [
      start(body),
      {
        type: 'error',
        code: 'model_error',
        message: 'Model failed',
        retryable: true,
        meter: fake.usage,
      },
    ],
  ],
  /**
   * The connection drops during the step: the app reads as offline until
   * `__WW_DEV__.network.offline(false)`, and the turn ends with `network`.
   */
  dropConnection: (): FakeStep[] => [
    () => {
      simulateOffline(true)
      return []
    },
  ],
  /** The conversation is over the input cap (413 `context_full`). */
  contextFull: (): FakeStep[] => [
    () => [
      {
        type: 'error',
        code: 'context_full',
        message: 'Context full',
        retryable: false,
        meter: null,
      },
    ],
  ],
} satisfies Record<string, () => FakeStep[]>

export type FakeScriptName = keyof typeof FAKE_SCRIPTS
export const FAKE_SCRIPT_NAMES = Object.keys(FAKE_SCRIPTS) as FakeScriptName[]

/** The fake's state; the harness edits it directly. */
export const fake = {
  status: fakeStatus(),
  usage: fakeUsage(),
  /** Steps still to answer, oldest first. */
  queue: [] as FakeStep[],
  /** Bodies of the steps answered, oldest first (the last 20). */
  requests: [] as StepRequest[],
  /** Text a paper page reads as; null fails the page. */
  pageText: 'Maria Lopez · 12 Oak St · came back for the brochure' as
    | string
    | null,
  /** What the next pages read as, in order, before `pageText`; null fails one. */
  pageTexts: [] as (string | null)[],
  /**
   * Pages read before the connection drops (the app then reads as offline until
   * `__WW_DEV__.network.offline(false)`); null never drops.
   */
  dropAfterPages: null as number | null,
  /** Milliseconds between streamed events, so the run states can be seen. */
  delayMs: 250,
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ScribeClientError('cancelled'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new ScribeClientError('cancelled'))
    })
  })

const fallbackStep: FakeStep = (body) => [
  start(body),
  ...words('Done. Anything else?'),
  done('end', fake.usage),
]

/** A ScribeClient that answers from `fake`. */
export const fakeScribeClient: ScribeClient = {
  status: async () => fake.status,
  usage: async () => fake.usage,
  step: async (body, { signal, onEvent }) => {
    if (getOnline() === false) throw new ScribeClientError('network')
    fake.requests = [...fake.requests, structuredClone(body)].slice(-20)
    const step = fake.queue.shift() ?? fallbackStep
    const events = step(body)
    for (const event of events) {
      await sleep(fake.delayMs, signal)
      if (getOnline() === false) throw new ScribeClientError('network')
      onEvent(event)
      if (event.type === 'done' || event.type === 'error') return event
    }
    // A script without a terminal event: the stream dropped.
    throw new ScribeClientError('network')
  },
  transcribe: async (_image, signal) => {
    await sleep(fake.delayMs * 4, signal)
    if (getOnline() === false) throw new ScribeClientError('network')
    if (fake.dropAfterPages === 0) {
      fake.dropAfterPages = null
      simulateOffline(true)
      throw new ScribeClientError('network')
    }
    const text = fake.pageTexts.length ? fake.pageTexts.shift() : fake.pageText
    if (text == null) throw new ScribeClientError('model_error')
    if (fake.dropAfterPages !== null) fake.dropAfterPages -= 1
    return { text, truncated: false, usage: fake.usage }
  },
}

/** Queues a canned turn's steps. */
export function queueScript(name: FakeScriptName): number {
  fake.queue.push(...FAKE_SCRIPTS[name]())
  return fake.queue.length
}
