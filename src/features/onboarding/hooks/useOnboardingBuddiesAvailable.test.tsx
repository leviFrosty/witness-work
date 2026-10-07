import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BuddiesAvailability } from '@/features/buddies/lib/availability'

const runtime = vi.hoisted(() => ({
  availability: 'hidden' as BuddiesAvailability,
}))

vi.mock('@/features/buddies/hooks/useBuddiesAvailability', () => ({
  default: () => runtime.availability,
}))

import useOnboardingBuddiesAvailable from '@/features/onboarding/hooks/useOnboardingBuddiesAvailable'

let renderer: ReactTestRenderer | undefined

const Probe = ({ reached }: { reached: boolean }) =>
  React.createElement('probe', {
    available: useOnboardingBuddiesAvailable(reached),
  })

/** Renders with `reached` and returns what the hook answered. */
const render = async (reached: boolean) => {
  await act(() => {
    if (renderer) renderer.update(<Probe reached={reached} />)
    else renderer = create(<Probe reached={reached} />)
  })
  const json = renderer?.toJSON()
  return json && !Array.isArray(json) ? json.props.available : undefined
}

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  runtime.availability = 'hidden'
})

describe('useOnboardingBuddiesAvailable', () => {
  it('follows availability before the step is reached', async () => {
    expect(await render(false)).toBe(false)
    runtime.availability = 'enabled'
    expect(await render(false)).toBe(true)
    runtime.availability = 'hidden'
    expect(await render(false)).toBe(false)
  })

  it('counts loading and a relay that is off as available', async () => {
    runtime.availability = 'loading'
    expect(await render(false)).toBe(true)
    runtime.availability = 'disabled'
    expect(await render(false)).toBe(true)
  })

  it('holds the answer once the step is reached', async () => {
    runtime.availability = 'enabled'
    await render(true)
    runtime.availability = 'hidden'
    expect(await render(true)).toBe(true)
  })

  it('never adds the step behind someone already past it', async () => {
    await render(true)
    runtime.availability = 'enabled'
    expect(await render(true)).toBe(false)
  })
})
