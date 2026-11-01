import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const appState = vi.hoisted(() => ({ currentState: 'active' }))
vi.mock('react-native', () => ({ AppState: appState }))
const installWatchSync = vi.hoisted(() => vi.fn(() => () => {}))
vi.mock('@/app/watch/watchSync', () => ({ installWatchSync }))

import { useWatchSync } from '@/app/watch/useWatchSync'

const Harness = ({ afterLaunch }: { afterLaunch: boolean }) => {
  useWatchSync(afterLaunch)
  return null
}

let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  installWatchSync.mockClear()
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

it('waits for launch work in a launch the user sees', () => {
  appState.currentState = 'active'
  act(() => {
    renderer = create(<Harness afterLaunch={false} />)
  })
  expect(installWatchSync).not.toHaveBeenCalled()

  act(() => renderer!.update(<Harness afterLaunch />))
  expect(installWatchSync).toHaveBeenCalledOnce()
})

it('installs at once in a background launch', () => {
  appState.currentState = 'background'
  act(() => {
    renderer = create(<Harness afterLaunch={false} />)
  })
  expect(installWatchSync).toHaveBeenCalledOnce()

  appState.currentState = 'active'
  act(() => renderer!.update(<Harness afterLaunch />))
  expect(installWatchSync).toHaveBeenCalledOnce()
})
