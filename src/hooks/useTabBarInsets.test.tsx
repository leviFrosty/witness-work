import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}))

import useTabBarInsets from '@/hooks/useTabBarInsets'
import { setTabBarInsets, useTabBarInsetsStore } from '@/stores/tabBarInsets'

let renderer: ReactTestRenderer | undefined
const seen: ReturnType<typeof useTabBarInsets>[] = []
function Probe() {
  seen.push(useTabBarInsets())
  return null
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  useTabBarInsetsStore.setState({ insets: null })
  seen.length = 0
})
afterEach(() => act(() => renderer?.unmount()))

it('uses the window safe area until a tab has been measured', () => {
  act(() => {
    renderer = create(<Probe />)
  })
  expect(seen.at(-1)).toEqual({
    top: 59,
    bottom: 34,
    windowBottom: 34,
    width: 390,
  })

  const measured = { top: 59, bottom: 83, windowBottom: 83, width: 390 }
  act(() => setTabBarInsets(measured))
  expect(seen.at(-1)).toEqual(measured)
})

it('ignores a measurement that changes nothing', () => {
  act(() => {
    renderer = create(<Probe />)
  })
  act(() =>
    setTabBarInsets({ top: 0, bottom: 0, windowBottom: 104, width: 412 })
  )
  const renders = seen.length
  act(() =>
    setTabBarInsets({ top: 0, bottom: 0, windowBottom: 104, width: 412 })
  )
  expect(seen).toHaveLength(renders)
})
