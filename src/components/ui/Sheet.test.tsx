import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ ScrollView: 'ScrollView' }))
vi.mock('@/components/ui/NativeSheet', () => ({ default: 'NativeSheet' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: { sheet: '#sheet' } }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (state: { colorScheme: string }) => unknown) =>
    select({ colorScheme: 'dark' }),
}))

import Sheet, { type SheetProps } from '@/components/ui/Sheet'
import { resetTakeovers, useTakeover } from '@/stores/takeover'

let root: ReactTestRenderer
const onOpenChange = vi.fn()
const onClosed = vi.fn()

const render = (props: Partial<SheetProps>) =>
  act(() => {
    const element = (
      <Sheet
        open={false}
        onOpenChange={onOpenChange}
        onClosed={onClosed}
        {...props}
      >
        <Sheet.ScrollView />
      </Sheet>
    )
    if (root) root.update(element)
    else root = create(element)
  })

const native = () => root.root.findAllByType('NativeSheet' as never)[0]
const holds = () => useTakeover.getState().arbiter.holds

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  resetTakeovers()
})

afterEach(() => {
  act(() => root.unmount())
  root = undefined as never
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('Sheet', () => {
  it('mounts the native sheet from its first open until it has closed', () => {
    render({ open: false })
    expect(native()).toBeUndefined()
    expect(holds()).toEqual([])

    render({ open: true })
    expect(native().props).toMatchObject({
      open: true,
      dismissible: true,
      backgroundColor: '#sheet',
      colorScheme: 'dark',
    })

    expect(holds()).toEqual([expect.stringMatching(/^sheet:/)])

    render({ open: false })
    expect(native().props.open).toBe(false)
    expect(holds()).toEqual([])

    act(() => native().props.onClosed())
    expect(native()).toBeUndefined()
    expect(onClosed).toHaveBeenCalledOnce()
  })

  it("passes the User's dismissal on as onOpenChange(false)", () => {
    render({ open: true, dismissible: false, backgroundColor: '#fff' })
    expect(native().props).toMatchObject({
      dismissible: false,
      backgroundColor: '#fff',
    })
    native().props.onDismiss()
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('scrolls content that fits the sheet, and fills a sheet with snap points', () => {
    const scroll = () => root.root.findByType('ScrollView' as never)

    render({ open: true })
    expect(scroll().props).toMatchObject({
      keyboardShouldPersistTaps: 'handled',
      style: [{ flexGrow: 0 }, undefined],
    })

    render({ open: true, snapPoints: ['half', 'full'] })
    expect(native().props.snapPoints).toEqual(['half', 'full'])
    expect(scroll().props.style).toEqual([{ flex: 1 }, undefined])
  })
})
