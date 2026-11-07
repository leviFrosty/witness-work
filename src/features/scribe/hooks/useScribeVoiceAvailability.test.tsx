import React, { useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  voice: true,
  supported: true,
  getAvailability: vi.fn(async () => ({
    available: true as const,
    locale: 'en-US',
    engine: 'androidOnDevice' as const,
  })),
}))

vi.mock('../../../../modules/speech-transcription', () => ({
  isSupported: () => mocks.supported,
  getAvailability: mocks.getAvailability,
}))
vi.mock('@/lib/platformCapabilities', () => ({
  hasCapability: (capability: string) =>
    capability === 'scribeVoice' ? mocks.voice : true,
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (state: { locale: string }) => unknown) =>
    select({ locale: 'en-us' }),
}))
vi.mock('@/features/scribe/lib/locale', () => ({
  speechLocaleCandidates: () => ['en-US'],
}))

import { useScribeVoiceAvailability } from '@/features/scribe/hooks/useScribeVoiceAvailability'
import type { ScribeVoiceAvailability } from '@/features/scribe/types'

let answer: ScribeVoiceAvailability
function Harness() {
  const value = useScribeVoiceAvailability()
  useEffect(() => {
    answer = value
  })
  return null
}
const render = async () => {
  await act(async () => {
    create(<Harness />)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.voice = true
  mocks.supported = true
})

it('has no voice input where the platform has none, whatever the device says', async () => {
  mocks.voice = false
  await render()
  expect(answer).toBe('unsupported')
  expect(mocks.getAvailability).not.toHaveBeenCalled()
})

it('asks on-device speech where the platform has voice input', async () => {
  await render()
  expect(answer).toBe('available')
  expect(mocks.getAvailability).toHaveBeenCalled()
})
