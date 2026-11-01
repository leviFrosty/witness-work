import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'

type FakeSession = { id: number; state: { step: string; reason?: string } }

const mocks = vi.hoisted(() => ({
  sessions: [] as FakeSession[],
  ended: [] as [number, string][],

  focus: null as null | (() => void | (() => void)),
  blur: null as null | (() => void),
  foreground: new Set<() => void>(),
}))

vi.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    mocks.focus = effect
  },
}))
vi.mock('@/app/account/handoff', () => ({
  startOfferHandoff: async () => {
    const session = {
      id: mocks.sessions.length + 1,
      state: { step: 'waiting' },
    }
    mocks.sessions.push(session)
    return { ok: true, session }
  },
  endHandoff: async (session: FakeSession, reason: string) => {
    mocks.ended.push([session.id, reason])
  },
}))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: (listener: () => void) => {
    mocks.foreground.add(listener)
    return { remove: () => mocks.foreground.delete(listener) }
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/features/settings/hooks/useHandoffSession', () => ({
  useHandoffState: (session: FakeSession | null) => session?.state ?? null,
  useHandoffPolling: () => undefined,
}))

import useOfferHandoff from './useOfferHandoff'

type Result = ReturnType<typeof useOfferHandoff>
let result: Result
const keep = (next: Result) => {
  result = next
}
const Probe = ({
  params,
  onResult,
}: {
  params?: object
  onResult: (result: Result) => void
}) => {
  onResult(useOfferHandoff('settings', params))
  return null
}

let root: ReactTestRenderer
const render = async (params?: object) => {
  await act(async () => {
    const probe = <Probe params={params} onResult={keep} />
    if (root) root.update(probe)
    else root = create(probe)
  })
}
const focus = async () => {
  await act(async () => {
    const cleanup = mocks.focus?.()
    mocks.blur = typeof cleanup === 'function' ? cleanup : null
  })
}
const blur = async () => {
  await act(async () => mocks.blur?.())
}
const foreground = async () => {
  await act(async () => mocks.foreground.forEach((listener) => listener()))
}

const end = async (state: FakeSession['state'], params?: object) => {
  mocks.sessions[mocks.sessions.length - 1].state = state
  await render(params)
}
const current = () => (result.session as unknown as FakeSession | null)?.id

beforeEach(async () => {
  mocks.sessions = []
  mocks.ended = []
  mocks.focus = null
  mocks.blur = null
  mocks.foreground.clear()
  root = undefined as unknown as ReactTestRenderer
  await render()
  await focus()
})

it('keeps a code that is still waiting on every return', async () => {
  await blur()
  await focus()
  await foreground()
  expect(current()).toBe(1)
})

it('starts fresh when the screen is focused again after a failure', async () => {
  await end({ step: 'failed', reason: 'cancelled' })
  await blur()
  await focus()
  expect(current()).toBe(2)
  expect(result.state).toEqual({ step: 'waiting' })
})

it('starts fresh when navigated to again after it finished', async () => {
  const params = { entry: 'settings' }
  await render(params)
  await end({ step: 'done' }, params)
  expect(current()).toBe(1)
  await render({ entry: 'settings' })
  expect(current()).toBe(2)
})

it('starts fresh on returning to the app after a failure, not after success', async () => {
  await end({ step: 'failed', reason: 'cancelled' })
  await foreground()
  expect(current()).toBe(2)
  await end({ step: 'done' })
  await foreground()
  expect(current()).toBe(2)

  await end({ step: 'failed', reason: 'updateRequired' })
  await foreground()
  expect(current()).toBe(2)
})
