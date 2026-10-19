import React, { useEffect } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { navigation, prevented } = vi.hoisted(() => ({
  navigation: { dispatch: vi.fn() },
  prevented: {
    value: false,
    callback: undefined as
      | ((options: { data: { action: { type: string } } }) => void)
      | undefined,
  },
}))
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => navigation,
  usePreventRemove: (
    value: boolean,
    callback: (options: { data: { action: { type: string } } }) => void
  ) => {
    prevented.value = value
    prevented.callback = callback
  },
}))

import { Alert, type AlertButton } from 'react-native'
import useDiscardChangesGuard from '@/hooks/useDiscardChangesGuard'
import useDraftChanged from '@/hooks/useDraftChanged'

type Draft = { name: string; date: Date; note?: string }

let renderer: ReactTestRenderer
let allowLeave: () => void
function Form({ draft }: { draft: Draft }) {
  const leave = useDiscardChangesGuard(useDraftChanged(draft))
  useEffect(() => {
    allowLeave = leave
  })
  return null
}
const start: Draft = { name: '', date: new Date('2026-10-19T09:00:00Z') }
async function render(draft: Draft) {
  await act(async () => {
    if (renderer) renderer.update(<Form draft={draft} />)
    else renderer = create(<Form draft={draft} />)
  })
}
const back = { type: 'GO_BACK' }
const leave = () => prevented.callback?.({ data: { action: back } })
const alertButtons = () =>
  vi.mocked(Alert.alert).mock.calls[0][2] as AlertButton[]

beforeEach(() => vi.clearAllMocks())
afterEach(async () => {
  await act(async () => renderer.unmount())
  renderer = undefined as unknown as ReactTestRenderer
})

describe('useDiscardChangesGuard', () => {
  it('lets an untouched form leave, including a copy of its start', async () => {
    await render(start)
    expect(prevented.value).toBe(false)
    await render({ ...start, date: new Date(start.date), note: undefined })
    expect(prevented.value).toBe(false)
  })

  it('guards a changed draft until it changes back', async () => {
    await render(start)
    await render({ ...start, name: 'Sam Lee' })
    expect(prevented.value).toBe(true)
    await render(start)
    expect(prevented.value).toBe(false)
  })

  it('asks before discarding, and leaves only on Discard', async () => {
    await render(start)
    await render({ ...start, name: 'Sam Lee' })
    leave()
    expect(vi.mocked(Alert.alert).mock.calls[0][0]).toBe('discardChanges')
    const [keep, discard] = alertButtons()
    expect([keep.text, keep.style]).toEqual(['keepEditing', 'cancel'])
    keep.onPress?.()
    expect(navigation.dispatch).not.toHaveBeenCalled()
    expect([discard.text, discard.style]).toEqual(['discard', 'destructive'])
    discard.onPress?.()
    expect(navigation.dispatch).toHaveBeenCalledWith(back)
  })

  it('leaves without asking once the form saved', async () => {
    await render(start)
    await render({ ...start, name: 'Sam Lee' })
    allowLeave()
    leave()
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(navigation.dispatch).toHaveBeenCalledWith(back)
  })
})
