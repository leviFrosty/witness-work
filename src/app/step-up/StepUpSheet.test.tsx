import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PasskeyAssertion } from '@/lib/passkeys/types'
import type { WebStepUp } from '@/lib/serverAccount/stepUp'

const harness = vi.hoisted(() => ({
  clock: { now: 0 },
  stepUp: null as WebStepUp | null,
  finishStepUp: null as ((...args: unknown[]) => void) | null,
}))

vi.mock('react-native', () => ({
  View: 'View',
  ActivityIndicator: 'ActivityIndicator',
}))
vi.mock('lucide-react-native', () => ({
  CircleAlert: 'CircleAlert',
  UserRoundKey: 'UserRoundKey',
  WifiOff: 'WifiOff',
}))
vi.mock('@/components/ui/ActionButton', () => ({ default: 'ActionButton' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/Sheet', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {},
    fonts: {},
    fontSize: () => 16,
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/app/web-sign-in/signInAgain', () => ({ startSignInAgain: vi.fn() }))
vi.mock('@/lib/serverAccount/stepUpPrompt', async () => {
  const { create: createStore } = await import('zustand')
  return {
    useStepUpPrompt: createStore(() => ({ request: null })),
    finishStepUp: (...args: unknown[]) => harness.finishStepUp?.(...args),
    finishContinue: vi.fn(),
    pageClock: () => harness.clock.now,
    webStepUp: () => harness.stepUp,
  }
})

import StepUpSheet from '@/app/step-up/StepUpSheet'
import { createWebStepUp } from '@/lib/serverAccount/stepUp'
import { useStepUpPrompt } from '@/lib/serverAccount/stepUpPrompt'

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  useStepUpPrompt.setState({ request: null })
})

const CREDENTIAL = 'Y3JlZA'
const assertion = {
  response: { id: CREDENTIAL, rawId: CREDENTIAL },
  prf: new Uint8Array(32).fill(9),
} as unknown as PasskeyAssertion

describe('the step-up sheet', () => {
  it('runs the passkey prompt straight from Continue with Passkey, however slow the challenge was', async () => {
    vi.useFakeTimers()
    try {
      const network: string[] = []
      const get = vi.fn(async () => {
        network.push('get')
        return assertion
      })
      harness.stepUp = createWebStepUp({
        online: () => true,
        // A slow link: the challenge takes 3 s, before anything is tapped.
        challenge: async () => {
          network.push('challenge')
          await new Promise((resolve) => setTimeout(resolve, 3_000))
          return {
            challengeToken: 'token',
            options: { challenge: 'c', allowCredentials: [{ id: CREDENTIAL }] },
          }
        },
        get,
        assert: async () => {
          network.push('assert')
          return { credentialId: CREDENTIAL, stepUpAt: 1 }
        },
        sessionWindow: async () => ({ now: 1, stepUpUntil: null }),
        elapsed: () => harness.clock.now,
      })
      const finished = vi.fn()
      harness.finishStepUp = finished

      act(() => {
        renderer = create(<StepUpSheet />)
      })
      act(() => {
        useStepUpPrompt.setState({
          request: {
            id: 1,
            kind: 'stepUp',
            action: 'change_account_key',
            resolve: vi.fn(),
          },
        })
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      const button = renderer!.root.findByProps({ testID: 'step-up-continue' })

      act(() => {
        button.props.onPress()
        // Still inside the tap's handler: nothing awaited or sent first.
        expect(get).toHaveBeenCalledTimes(1)
        expect(network).toEqual(['challenge', 'get'])
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      // The server checked it after the prompt, never before.
      expect(network).toEqual(['challenge', 'get', 'assert'])
    } finally {
      vi.useRealTimers()
    }
  })
})
