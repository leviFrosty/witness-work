import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

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
vi.mock('@/features/scribe/runtime/status', () => ({
  noteScribeFailure: vi.fn(),
}))
vi.mock('@/lib/appUpdate', () => ({ appVersion: () => '1.0.0' }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn(), captureMessage: vi.fn() },
}))

const { client } = vi.hoisted(() => {
  vi.stubGlobal('__DEV__', false)
  return {
    client: {
      release: null as null | (() => void),
    },
  }
})
vi.mock('@/features/scribe/lib/defaultClient', () => ({
  scribeClient: () => ({
    status: async () => {
      throw new Error('unused')
    },
    usage: async () => {
      throw new Error('unused')
    },
    transcribe: async () => {
      throw new Error('unused')
    },
    step: async (
      _body: unknown,
      { onEvent }: { onEvent: (event: unknown) => void }
    ) => {
      onEvent({ type: 'start', offered: [], dropped: [] })
      onEvent({ type: 'text', delta: 'Thinking it ' })
      await new Promise<void>((resolve) => {
        client.release = resolve
      })
      onEvent({ type: 'text', delta: 'over.' })
      const done = {
        type: 'done',
        finish: 'end',
        usage: {
          inputTokens: 3_000,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 10,
          reasoningTokens: 0,
          units: 10,
        },
        meter: null,
      }
      onEvent(done)
      return done
    },
  }),
  setScribeClientOverride: vi.fn(),
  hasScribeClientOverride: () => false,
}))

import type { ScribeConversationController } from '@/features/scribe/types'
import { useScribeConversation } from '@/features/scribe/hooks/useScribeConversation'
import {
  getConversation,
  newConversation,
  putConversation,
  useScribeConversations,
} from '@/features/scribe/stores/conversations'
import { setDrafting, useScribeRuns } from '@/features/scribe/runtime/runs'

let root: ReactTestRenderer | undefined
let latest: ScribeConversationController

function Probe({
  id,
  onRender,
}: {
  id: string | null
  onRender: (controller: ScribeConversationController) => void
}) {
  onRender(useScribeConversation(id))
  return null
}
const keep = (controller: ScribeConversationController) => {
  latest = controller
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  useScribeConversations.setState(
    useScribeConversations.getInitialState(),
    true
  )
  useScribeRuns.setState(useScribeRuns.getInitialState(), true)
})
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = undefined
})

it('starts a conversation on the first send and streams the reply into it', async () => {
  await act(async () => {
    root = create(<Probe id={null} onRender={keep} />)
  })
  expect(latest).toMatchObject({
    conversationId: null,
    items: [],
    run: { phase: 'idle' },
    budget: 'ok',
    pendingProposalId: null,
  })

  let sent!: Promise<void>
  await act(async () => {
    sent = latest.send({
      text: 'How am I doing?',
      source: 'keyboard',
      entry: 'home_orb',
    })
  })
  await vi.waitFor(() => expect(client.release).not.toBeNull())
  await act(async () => {})

  expect(latest.conversationId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  expect(latest.run).toEqual({ phase: 'thinking', reading: [] })
  expect(latest.items.map((item) => item.type)).toEqual(['user', 'assistant'])
  expect(latest.items[1]).toMatchObject({
    text: 'Thinking it ',
    streaming: true,
  })

  await act(async () => {
    client.release?.()
    await sent
  })
  expect(latest.run).toEqual({ phase: 'idle' })
  expect(latest.items[1]).toMatchObject({
    text: 'Thinking it over.',
    streaming: false,
  })
  expect(
    useScribeConversations.getState().conversations[latest.conversationId!]
      .title
  ).toBe('How am I doing?')
})

it('shows the drafting Proposal where the turn will keep it', async () => {
  const id = 'conversation-drafting'
  const userItem = {
    type: 'user' as const,
    id: 't-u',
    at: 1,
    text: 'Log an hour',
    source: 'keyboard' as const,
  }
  putConversation({
    ...newConversation(id, 1, 'Log an hour'),
    items: [userItem],
  })
  const proposal = {
    id: 'pr_1',
    conversationId: id,
    turnId: 't',
    createdAt: 2,
    status: 'pending' as const,
    effects: [],
    cards: [],
    invalidCount: 0,
    tainted: false,
    resolvedAt: null,
  }
  await act(async () => {
    root = create(<Probe id={id} onRender={keep} />)
  })
  await act(async () => setDrafting(id, proposal))
  const drafted = latest.items.map((item) => item.id)
  expect(drafted).toEqual(['t-u', 'pr_1-item'])

  await act(async () => {
    putConversation({
      ...getConversation(id)!,
      items: [
        userItem,
        { type: 'proposal', id: 'pr_1-item', at: 3, proposalId: 'pr_1' },
      ],
      proposals: { pr_1: proposal },
      pendingProposalId: 'pr_1',
    })
    setDrafting(id, null)
  })
  expect(latest.items.map((item) => item.id)).toEqual(drafted)

  await act(async () => setDrafting(id, proposal))
  expect(latest.items.map((item) => item.id)).toEqual(drafted)
})
