import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AlertButton } from 'react-native'

const runtime = vi.hoisted(() => ({
  appState: null as ((state: string) => void) | null,
  doorRecords: 'keep' as 'keep' | 'decline',
}))

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appState = listener
      return { remove: () => (runtime.appState = null) }
    },
  },
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/hooks/useTakeoverTurn', () => ({
  default: (_kind: string, want: boolean) => ({
    active: want,
    status: want ? 'active' : 'idle',
  }),
}))
vi.mock('@/app/data-protection/dataProtectionFlows', () => ({
  applyDataProtectionOn: (
    apply: () => void,
    outcome: { onDecline?: () => void }
  ) => (runtime.doorRecords === 'keep' ? apply() : outcome.onDecline?.()),
}))
vi.mock('@/stores/preferences', async () => {
  const { create } = await import('zustand')
  const { answeredDataProtection } = await import('@/lib/dataProtectionAccount')
  type State = {
    onboardingComplete: boolean
    dataProtectionMode: boolean
    dataProtectionModeSetByUser: boolean
    dataProtectionAccount: unknown
    dataProtectionAccountAnswered: number | null
    answerAccountDataProtection: (follow: boolean) => void
  }
  const usePreferences = create<State>()((set, get) => ({
    onboardingComplete: true,
    dataProtectionMode: false,
    dataProtectionModeSetByUser: false,
    dataProtectionAccount: null,
    dataProtectionAccountAnswered: null,
    answerAccountDataProtection: (follow) => {
      const answer = answeredDataProtection(get(), follow)
      if (answer) set(answer)
    },
  }))
  return { usePreferences }
})

import { Alert } from 'react-native'
import AccountDataProtectionPrompt from '@/app/data-protection/AccountDataProtectionPrompt'
import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'

let renderer: ReactTestRenderer | null = null
const render = async () => {
  await act(async () => {
    renderer = create(<AccountDataProtectionPrompt />)
  })
}
const arrive = (on: boolean, at: number) =>
  act(() => {
    usePreferences.setState({ dataProtectionAccount: { on, at } })
  })

const prompt = (call = 0) => {
  const [title, message, buttons] = vi.mocked(Alert.alert).mock.calls[call]
  return { title, message, buttons: buttons as AlertButton[] }
}
const press = (label: string, call = 0) =>
  act(() => prompt(call).buttons.find((b) => b.text === label)!.onPress!())

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: 1_000_000 })
  runtime.doorRecords = 'keep'
  usePreferences.setState({
    onboardingComplete: true,
    dataProtectionMode: false,
    dataProtectionModeSetByUser: false,
    dataProtectionAccount: null,
    dataProtectionAccountAnswered: null,
  })
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  vi.useRealTimers()
})

describe('AccountDataProtectionPrompt', () => {
  it('asks to follow a choice that arrives on opening, and follows', async () => {
    await render()
    await arrive(true, 100)
    expect(prompt().title).toBe('dataProtectionFollowOnTitle')
    expect(prompt().buttons.map((b) => b.text)).toEqual([
      'dataProtectionFollowOnDecline',
      'dataProtectionTurnOnAction',
    ])
    expect(analytics.capture).toHaveBeenCalledWith(
      'data_protection_follow_shown',
      { change: 'on' }
    )
    await press('dataProtectionTurnOnAction')
    expect(usePreferences.getState()).toMatchObject({
      dataProtectionMode: true,
      dataProtectionAccountAnswered: 100,
    })
    expect(analytics.capture).toHaveBeenCalledWith(
      'data_protection_follow_answered',
      { change: 'on', outcome: 'followed', step: 'prompt' }
    )
    expect(Alert.alert).toHaveBeenCalledOnce()
  })

  it('opts out on this device and stays out', async () => {
    await render()
    await arrive(true, 100)
    await press('dataProtectionFollowOnDecline')
    expect(usePreferences.getState()).toMatchObject({
      dataProtectionMode: false,
      dataProtectionAccountAnswered: 100,
    })
    expect(analytics.capture).toHaveBeenCalledWith(
      'data_protection_follow_answered',
      { change: 'on', outcome: 'opted_out', step: 'prompt' }
    )
    await arrive(true, 100)
    act(() => runtime.appState?.('active'))
    expect(Alert.alert).toHaveBeenCalledOnce()
  })

  it('counts declining the door records as opting out', async () => {
    runtime.doorRecords = 'decline'
    await render()
    await arrive(true, 100)
    await press('dataProtectionTurnOnAction')
    expect(usePreferences.getState().dataProtectionMode).toBe(false)
    expect(analytics.capture).toHaveBeenCalledWith(
      'data_protection_follow_answered',
      { change: 'on', outcome: 'opted_out', step: 'door_records' }
    )
  })

  it('asks before turning it off, and can keep it on', async () => {
    usePreferences.setState({ dataProtectionMode: true })
    await render()
    await arrive(false, 100)
    expect(prompt().title).toBe('dataProtectionFollowOffTitle')
    await press('dataProtectionFollowOffDecline')
    expect(usePreferences.getState().dataProtectionMode).toBe(true)
  })

  it('waits for the next foreground for a change that lands later', async () => {
    await render()
    vi.advanceTimersByTime(5 * 60_000)
    await arrive(true, 100)
    expect(Alert.alert).not.toHaveBeenCalled()
    act(() => runtime.appState?.('background'))
    act(() => runtime.appState?.('active'))
    expect(prompt().title).toBe('dataProtectionFollowOnTitle')
  })

  it('waits until onboarding is done', async () => {
    usePreferences.setState({ onboardingComplete: false })
    await render()
    await arrive(true, 100)
    expect(Alert.alert).not.toHaveBeenCalled()
    act(() => {
      usePreferences.setState({ onboardingComplete: true })
    })
    expect(Alert.alert).toHaveBeenCalledOnce()
  })

  it('records a choice this device already matches without asking', async () => {
    usePreferences.setState({ dataProtectionMode: true })
    await render()
    await arrive(true, 100)
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(usePreferences.getState().dataProtectionAccountAnswered).toBe(100)
  })
})
