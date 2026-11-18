import React, { createContext, useEffect } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const disk = vi.hoisted(() => new Map<string, string>())
const RouteContext = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    set = (key: string, value: string) => void disk.set(key, value)
    getString = (key: string) => disk.get(key)
    delete = (key: string) => void disk.delete(key)
    getAllKeys = () => [...disk.keys()]
  },
}))
vi.mock('@react-navigation/native', async () => {
  const { createContext: make } = await import('react')
  RouteContext.current = make<{ key: string } | undefined>(undefined)
  return { NavigationRouteContext: RouteContext.current }
})

import {
  resetReloadRestoreForTests,
  useReloadState,
} from '@/lib/reloadRestore/index.web'

void createContext
const Route = () =>
  RouteContext.current as React.Context<{ key: string } | undefined>

let setName: (name: string) => void = () => {}
let shown = ''
function Form({ name = 'name' as string | null }) {
  const [value, set] = useReloadState(name, 'start')
  useEffect(() => {
    setName = set
    shown = value
  })
  return null
}

const mount = async (routeKey: string | undefined, name?: string | null) => {
  let renderer!: ReactTestRenderer
  const Provider = Route().Provider
  await act(async () => {
    renderer = create(
      <Provider value={routeKey ? { key: routeKey } : undefined}>
        <Form name={name} />
      </Provider>
    )
  })
  return renderer
}

const reload = () => resetReloadRestoreForTests()

beforeEach(() => {
  disk.clear()
  reload()
})

describe('useReloadState', () => {
  it('brings back what was typed after a reload', async () => {
    await mount('Contact Form-1')
    await act(async () => setName('Quinn Marlowe'))
    reload()
    await mount('Contact Form-1')
    expect(shown).toBe('Quinn Marlowe')
  })

  it('forgets the draft when the form closes', async () => {
    const renderer = await mount('Contact Form-1')
    await act(async () => setName('Quinn Marlowe'))
    await act(async () => renderer.unmount())
    await mount('Contact Form-1')
    expect(shown).toBe('start')
  })

  it('keeps a draft to its own screen', async () => {
    await mount('Contact Form-1')
    await act(async () => setName('Quinn Marlowe'))
    reload()
    await mount('Contact Form-2')
    expect(shown).toBe('start')
  })

  it('keeps nothing outside a screen, or without a name', async () => {
    await mount(undefined)
    await act(async () => setName('Quinn Marlowe'))
    await mount('Contact Form-1', null)
    await act(async () => setName('Quinn Marlowe'))
    expect(disk.size).toBe(0)
  })
})
