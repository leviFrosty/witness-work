import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  brightness: 0.4,
  appState: 'active',
  listeners: new Set<(state: string) => void>(),

  read: null as null | (() => void),
}))

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mocks.appState
    },
    addEventListener: (_: string, listener: (state: string) => void) => {
      mocks.listeners.add(listener)
      return { remove: () => mocks.listeners.delete(listener) }
    },
  },
}))
vi.mock('expo-brightness', () => ({
  getBrightnessAsync: () =>
    new Promise<number>((resolve) => {
      const level = mocks.brightness
      mocks.read = () => resolve(level)
    }),
  setBrightnessAsync: async (level: number) => {
    mocks.brightness = level
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

import useFullBrightness from '@/hooks/useFullBrightness'

function Code() {
  useFullBrightness()
  return null
}

const settle = () => act(async () => {})
const release = () =>
  act(async () => {
    mocks.read?.()
    mocks.read = null
  })
const setAppState = (state: string) =>
  act(async () => {
    mocks.appState = state
    mocks.listeners.forEach((listener) => listener(state))
  })

let renderer: ReactTestRenderer
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.brightness = 0.4
  mocks.appState = 'active'
  mocks.listeners.clear()
  mocks.read = null
})

it('raises the screen while shown and puts the level back on close', async () => {
  await act(async () => {
    renderer = create(<Code />)
  })
  await release()
  expect(mocks.brightness).toBe(1)
  await act(async () => renderer.unmount())
  await settle()
  expect(mocks.brightness).toBe(0.4)
  expect(mocks.listeners.size).toBe(0)
})

it('leaves the level alone when the code closes before it reads it', async () => {
  await act(async () => {
    renderer = create(<Code />)
  })
  await act(async () => renderer.unmount())
  await release()
  expect(mocks.brightness).toBe(0.4)
})

it('leaves the level alone when the app leaves before it reads it', async () => {
  await act(async () => {
    renderer = create(<Code />)
  })
  await setAppState('background')
  await release()
  expect(mocks.brightness).toBe(0.4)
  await setAppState('active')
  await release()
  expect(mocks.brightness).toBe(1)
  await act(async () => renderer.unmount())
  await settle()
  expect(mocks.brightness).toBe(0.4)
})
