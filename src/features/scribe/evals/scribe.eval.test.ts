import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios', select: (options: { ios?: unknown }) => options.ios },
  AppState: { currentState: 'active', addEventListener: vi.fn() },
}))
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'eval-uuid',
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

import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { createAccountSessions } from '@/lib/serverAccount/session'
import {
  DEFAULT_SCRIBE_LIMITS,
  type StepRequest,
  type StepTerminalEvent,
} from '@/features/scribe/lib/wire'
import { createScribeClient } from '@/features/scribe/lib/scribeClient'
import { sendScribeMessage } from '@/features/scribe/runtime/turnLoop'
import {
  readScribeStores,
  type ScribeStores,
} from '@/features/scribe/runtime/snapshot'
import { RefRegistry } from '@/features/scribe/runtime/refs'
import {
  addScribeProposal,
  dismissScribeProposal,
  undoScribeProposalNow,
} from '@/features/scribe/proposals/actions'
import { toScribeProposal } from '@/features/scribe/proposals/cards'
import {
  getConversation,
  useScribeConversations,
} from '@/features/scribe/stores/conversations'
import { useScribeLedger } from '@/features/scribe/stores/ledger'
import { useScribeMemory } from '@/features/scribe/stores/memory'
import { SCRIBE_TOOLS, scribeTool } from '@/features/scribe/tools'
import { NOW } from '@/features/scribe/tools/__fixtures__/stores'
import { evalStores } from '@/features/scribe/evals/evalStores'
import {
  replyRules,
  SCENARIOS,
  type EvalCall,
  type EvalScenario,
  type TurnResult,
} from '@/features/scribe/evals/scenarios'

/**
 * Scribe AI's model eval: every scenario in `scenarios.ts`, through the app's
 * real turn loop, tools, Refs and context, against a local ww-api worker that
 * has the real model. Opt-in and paid (OpenRouter), e.g.
 *
 * SCRIBE_EVAL_WORKER=~/dev/ww-api-worktrees/<branch>\
 * Pnpm exec vitest run src/features/scribe/evals
 *
 * With that worktree's `node scripts/verify/dev.mjs up --secrets-from …`
 * running (its `.verify/state.json` has the URL and dev bypass token).
 * `SCRIBE_EVAL_ONLY=id,id` picks scenarios, `SCRIBE_EVAL_SHARD=2/3` one shard
 * of them, `SCRIBE_EVAL_RUNS=3` repeats each. The report, with every turn's
 * calls, reply, steps and usage, lands in this repo's
 * `.verify/artifacts/scribe-eval-<timestamp>.json`.
 */

const workerDir = process.env.SCRIBE_EVAL_WORKER?.replace(
  /^~/,
  process.env.HOME ?? '~'
)
const statePath = workerDir ? join(workerDir, '.verify', 'state.json') : null
const state =
  statePath && existsSync(statePath)
    ? (JSON.parse(readFileSync(statePath, 'utf8')) as {
        url: string
        tokens?: { devBypass?: string }
      })
    : null
const ENABLED = Boolean(state?.url && state.tokens?.devBypass)

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
let ip = Math.floor(Math.random() * 60_000)
/** A fresh caller IP per request, so the per-IP limits never pace the eval. */
const withIp: typeof fetch = (input, init) => {
  ip = (ip + 1) % 65_536
  const headers = new Headers(init?.headers)
  headers.set('cf-connecting-ip', `198.18.${ip >> 8}.${ip & 255}`)
  return fetch(input, { ...init, headers })
}

interface StepLog {
  step: number
  ms: number
  finish: string
  usage: StepTerminalEvent extends infer E
    ? E extends { usage: infer U }
      ? U
      : null
    : null
  tools: number
}

function seed(stores: ScribeStores) {
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
  useBuddies.setState({
    buddies: [...stores.buddies],
    cards: { ...stores.buddyCards },
  })
  // The Preferences fields Scribe AI reads, as `readScribeStores` reads them.
  usePreferences.setState(
    stores.preferences as unknown as Parameters<
      typeof usePreferences.setState
    >[0]
  )
  useScribeConversations.setState(
    useScribeConversations.getInitialState(),
    true
  )
  useScribeLedger.setState(useScribeLedger.getInitialState(), true)
  useScribeMemory.setState({ ...stores.memory, updatedAt: null })
}

const pick = (scenarios: EvalScenario[]) => {
  const only = process.env.SCRIBE_EVAL_ONLY?.split(',').map((id) => id.trim())
  let chosen = only
    ? scenarios.filter((scenario) =>
        only.some((id) =>
          id.endsWith('*')
            ? scenario.id.startsWith(id.slice(0, -1))
            : scenario.id === id
        )
      )
    : scenarios
  const shard = /^(\d+)\/(\d+)$/.exec(process.env.SCRIBE_EVAL_SHARD ?? '')
  if (shard)
    chosen = chosen.filter((_, index) => index % +shard[2] === +shard[1] - 1)
  return chosen
}

const report: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  worker: state?.url ?? null,
  scenarios: [] as unknown[],
}

afterAll(() => {
  if (!ENABLED) return
  const results = report.scenarios as {
    id: string
    pass: boolean
    units: number
  }[]
  report.summary = {
    passed: results.filter((result) => result.pass).length,
    total: results.length,
    units: results.reduce((sum, result) => sum + result.units, 0),
  }
  const dir = join(process.cwd(), '.verify', 'artifacts')
  mkdirSync(dir, { recursive: true })
  const shard = process.env.SCRIBE_EVAL_SHARD?.replace('/', 'of')
  const path = join(
    dir,
    `scribe-eval-${new Date().toISOString().replace(/[:.]/g, '-')}${shard ? `-${shard}` : ''}.json`
  )
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)
  console.info(`scribe eval report: ${path}`)
})

describe.skipIf(!ENABLED)('Scribe AI on the real model', () => {
  const accountKey = random(32)
  let stored: string | null = null
  const sessions = createAccountSessions({
    baseUrl: state?.url ?? '',
    now: Date.now,
    randomBytes: random,
    fetchImpl: withIp,
    attestation: {
      assert: (request) =>
        request.submit({ kind: 'devBypass', token: state!.tokens!.devBypass! }),
    },
    store: {
      read: async () => stored,
      write: async (value) => {
        stored = value
      },
    },
    accountKey: async () => accountKey,
  })
  const url = (path: string) => `${state?.url}/scribe/v1/${path}`
  const steps: StepLog[] = []
  const inner = createScribeClient({
    urls: {
      status: url('status'),
      usage: url('usage'),
      step: url('step'),
      transcribe: url('transcribe'),
    },
    streamFetch: withIp,
    fetchImpl: withIp,
    sessions: {
      withSession: (run, call) =>
        sessions.withSession(run, { accountKey, signal: call?.signal }),
    },
    linkBeforePaidCall: async () => {},
  })
  const client = {
    ...inner,
    step: async (
      body: StepRequest,
      options: Parameters<typeof inner.step>[1]
    ) => {
      const started = Date.now()
      const terminal = await inner.step(body, options)
      steps.push({
        step: body.step,
        ms: Date.now() - started,
        finish: terminal.type === 'done' ? terminal.finish : terminal.code,
        usage: terminal.type === 'done' ? terminal.usage : null,
        tools: body.tools.length,
      })
      return terminal
    },
  }

  const runs = Math.max(1, Number(process.env.SCRIBE_EVAL_RUNS ?? 1))
  const chosen = pick(SCENARIOS)

  for (const scenario of chosen)
    for (let run = 1; run <= runs; run++)
      it(
        `${scenario.id}${runs > 1 ? ` #${run}` : ''}`,
        { timeout: 180_000 },
        async () => {
          const stores = (scenario.stores ?? evalStores)()
          seed(stores)
          let seq = 0
          const base = Date.now()
          const deps = {
            client: () => client,
            stores: readScribeStores,
            now: () => NOW,
            ulid: () =>
              `01K${(base + ++seq).toString(32).toUpperCase().padStart(23, '0')}`
                .replace(/[ILOU]/g, 'X')
                .slice(0, 26),
            app: () => ({
              version: '1.0.0',
              platform: 'ios' as const,
              locale: scenario.locale ?? 'en-US',
            }),
            tz: () => 'America/Chicago',
            limits: () => DEFAULT_SCRIBE_LIMITS,
            tools: SCRIBE_TOOLS,
            tool: scribeTool,
          }
          let conversationId: string | null = null
          const turns: unknown[] = []
          let pass = true
          let units = 0
          for (const turn of scenario.turns) {
            const pending = conversationId
              ? getConversation(conversationId)?.pendingProposalId
              : null
            if (turn.before && pending) {
              if (turn.before === 'dismiss') dismissScribeProposal(pending, NOW)
              else {
                addScribeProposal(pending, { now: NOW })
                if (turn.before === 'undo')
                  undoScribeProposalNow(pending, 'conversation', NOW.getTime())
              }
            }
            const before = conversationId
              ? getConversation(conversationId)!
              : null
            const messagesBefore = before?.messages.length ?? 0
            const itemsBefore = before?.items.length ?? 0
            steps.length = 0
            const started = Date.now()
            conversationId = await sendScribeMessage(deps, conversationId, {
              text: turn.text,
              source: 'keyboard',
              entry: 'home_orb',
            })
            const ms = Date.now() - started
            const conversation = getConversation(conversationId)!
            const fresh = conversation.messages.slice(messagesBefore)
            const results = new Map<
              string,
              { ok: boolean; error: string | null }
            >()
            for (const message of fresh)
              if (message.role === 'tool')
                for (const block of message.content)
                  results.set(block.callId, {
                    ok: block.ok,
                    error: block.ok ? null : block.error,
                  })
            const calls: EvalCall[] = []
            let step = 0
            const texts: string[] = []
            for (const message of fresh) {
              if (message.role !== 'assistant') continue
              for (const block of message.content) {
                if (block.type === 'text') texts.push(block.text)
                if (block.type !== 'tool_call') continue
                const tool = scribeTool(block.name)
                const result = results.get(block.callId)
                calls.push({
                  name: block.name,
                  access: tool?.access ?? 'read',
                  args: block.args,
                  ok: result?.ok ?? false,
                  error: result?.error ?? null,
                  step,
                })
              }
              step++
            }
            const refs = new RefRegistry(structuredClone(conversation.refs))
            const resolve = (value: unknown): string | null => {
              if (typeof value !== 'string') return null
              const resolved = refs.resolve(value)
              if (!resolved) return null
              if (resolved.kind === 'n' || resolved.kind === 'nk')
                return `new:${value}`
              if (resolved.kind === 'k' && resolved.id === null)
                return 'standard'
              return resolved.id
            }
            const result: TurnResult = {
              text: texts.join('\n').trim(),
              calls,
              resolve,
            }
            const failures = [
              ...turn.checks
                .map((check) => check(result))
                .filter((failure): failure is string => failure !== null),
              ...replyRules(result, turn.answer ?? false),
            ]
            const items = conversation.items.slice(itemsBefore)
            const notices = items
              .filter((item) => item.type === 'notice')
              .map((item) => (item.type === 'notice' ? item.notice.kind : null))
            const proposal = conversation.pendingProposalId
              ? toScribeProposal(
                  conversation.proposals[conversation.pendingProposalId],
                  readScribeStores()
                )
              : null
            const turnUnits = steps.reduce(
              (sum, entry) => sum + (entry.usage?.units ?? 0),
              0
            )
            units += turnUnits
            if (failures.length) pass = false
            turns.push({
              text: turn.text,
              before: turn.before ?? null,
              pass: failures.length === 0,
              failures,
              reply: result.text,
              calls: calls.map((call) => ({
                ...call,
                resolved: Object.fromEntries(
                  Object.entries(call.args)
                    .filter(([key]) => /Ref$/.test(key))
                    .map(([key, value]) => [key, resolve(value)])
                ),
              })),
              cards:
                proposal?.cards.map((card) => ({
                  kind: card.kind,
                  previews: card.effects.map((effect) => effect.preview),
                })) ?? null,
              notices,
              error:
                conversation.suspended || notices.length ? null : undefined,
              ms,
              steps: steps.map((entry) => ({ ...entry })),
              units: turnUnits,
            })
          }
          ;(report.scenarios as unknown[]).push({
            id: scenario.id,
            group: scenario.group,
            run,
            pass,
            units,
            turns,
          })
          // A failed scenario is a finding for the report, not a broken test.
          expect(turns.length).toBe(scenario.turns.length)
        }
      )
})
