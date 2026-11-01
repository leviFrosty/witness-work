import React from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import useMapProjection from '@/features/map/hooks/useMapProjection'

const seen: ReturnType<typeof useMapProjection>[] = []
const latest = () => seen.at(-1)!

const fakeMap = () => {
  const pending: (() => void)[] = []
  const map = {
    pointForCoordinate: (c: { latitude: number; longitude: number }) =>
      new Promise<{ x: number; y: number }>((resolve) =>
        pending.push(() =>
          resolve({
            x: (c.longitude + 122) * 1000,
            y: (37.1 - c.latitude) * 1000,
          })
        )
      ),
  }
  const answer = () =>
    act(async () => {
      for (const go of pending.splice(0)) go()
    })
  return { map, answer }
}

describe('useMapProjection', () => {
  it('keeps the last projection while a resize is measured', async () => {
    const { map, answer } = fakeMap()
    function Probe() {
      seen.push(useMapProjection({ current: map as never }))
      return null
    }
    await act(async () => {
      create(<Probe />)
    })
    const region = {
      latitude: 37.05,
      longitude: -121.95,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    }
    await act(async () => latest().onLayout({ width: 100, height: 100 }))
    await act(async () => latest().onRegionChangeComplete(region))
    await answer()
    expect(latest().projection?.size).toEqual({ width: 100, height: 100 })

    await act(async () => latest().onLayout({ width: 200, height: 100 }))

    expect(latest().projection?.size).toEqual({ width: 100, height: 100 })
    await answer()
    expect(latest().projection?.size).toEqual({ width: 200, height: 100 })
  })
})
