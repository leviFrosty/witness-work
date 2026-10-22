import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ClaimCompletion } from '@/app/account/handoff'

type FakeSession = {
  channelId: string
  state: { step: string }
  fail: (reason: string) => void
}

const mocks = vi.hoisted(() => ({
  sessions: [] as FakeSession[],
  ended: [] as [string, string][],
  completions: [] as {
    channelId: string
    settle: (completion: ClaimCompletion) => void
  }[],
}))

vi.mock('@/app/account/handoff', () => ({
  startClaimHandoff: (offer: { channelId: string }) => {
    const session: FakeSession = {
      channelId: offer.channelId,
      state: { step: 'waiting' },
      fail: vi.fn(),
    }
    mocks.sessions.push(session)
    return session
  },
  completeClaimHandoff: (session: FakeSession) =>
    new Promise<ClaimCompletion>((settle) => {
      mocks.completions.push({ channelId: session.channelId, settle })
    }),
  endHandoff: async (session: FakeSession, reason: string) => {
    mocks.ended.push([session.channelId, reason])
  },
}))
vi.mock('@/lib/serverAccount/handoff', () => ({
  parseHandoffLink: (link: string) => ({
    ok: true,
    offer: { channelId: link },
  }),
}))
vi.mock('@/lib/http/online', () => ({
  addReconnectListener: () => ({ remove: () => undefined }),
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/features/buddies/hooks/useBuddiesEnabled', () => ({
  default: () => true,
}))
vi.mock('@/features/settings/components/account/confirmAccountReplace', () => ({
  confirmAccountReplace: async () => true,
}))
vi.mock('@/features/settings/hooks/useHandoffSession', () => ({
  useHandoffState: (session: FakeSession | null) =>
    session ? { ...session.state } : null,
  useHandoffPolling: () => undefined,
}))

import useClaimHandoff from './useClaimHandoff'

type Result = ReturnType<typeof useClaimHandoff>
let result: Result
const keep = (next: Result) => {
  result = next
}
const Probe = ({
  link,
  onResult,
}: {
  link?: string
  onResult: (result: Result) => void
}) => {
  onResult(useClaimHandoff('settings', link))
  return null
}

let root: ReactTestRenderer | undefined
const render = async (link?: string) => {
  await act(async () => {
    const probe = <Probe link={link} onResult={keep} />
    if (root) root.update(probe)
    else root = create(probe)
  })
}
/** The old phone sent the key for the newest code. */
const keyArrives = async (link: string) => {
  mocks.sessions.at(-1)!.state = { step: 'received' }
  await render(link)
}
const settle = async (channelId: string, completion: ClaimCompletion) => {
  await act(async () => {
    mocks.completions.find((c) => c.channelId === channelId)!.settle(completion)
  })
}

beforeEach(() => {
  mocks.sessions = []
  mocks.ended = []
  mocks.completions = []
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
})

it("doesn't show an earlier code's outcome once another code was opened", async () => {
  await render('first')
  await keyArrives('first')
  expect(result.completion).toBe('running')

  // While the first key signs in, another code's link opens.
  await render('second')
  expect(result.session?.channelId).toBe('second')
  await settle('first', {
    outcome: 'done',
    buddiesStarted: false,
    restore: { outcome: 'none' },
  } as ClaimCompletion)
  expect(result.completion).toBe('idle')

  // The second code still completes once its key arrives.
  await keyArrives('second')
  expect(result.completion).toBe('running')
  await settle('second', { outcome: 'declined' })
  expect(result.completion).toEqual({ outcome: 'declined' })
})

it('lets go of an earlier code whose key it could not use yet', async () => {
  await render('first')
  await keyArrives('first')
  await render('second')
  await settle('first', {
    outcome: 'failed',
    reason: 'offline',
    retryable: true,
  })
  expect(result.completion).toBe('idle')
  expect(mocks.ended).toEqual([['first', 'left']])

  // Leaving now cancels only the code that's still waiting.
  await act(async () => root?.unmount())
  root = undefined
  expect(mocks.ended).toEqual([
    ['first', 'left'],
    ['second', 'left'],
  ])
})
