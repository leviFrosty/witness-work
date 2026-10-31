import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('@/stores/toasts', () => ({ toast: { error: mocks.error } }))

import Alert from '@/vendor/web/alert'

describe('web Alert', () => {
  afterEach(() => {
    mocks.error.mockClear()
    vi.unstubAllGlobals()
  })

  it('shows a message as a toast', () => {
    Alert.alert('Error', 'Something went wrong')
    expect(mocks.error).toHaveBeenCalledWith('Error', {
      message: 'Something went wrong',
    })
  })

  it('shows an OK-only alert as a toast and runs its handler', () => {
    const onPress = vi.fn()
    Alert.alert('Done', undefined, [{ text: 'OK', onPress }])
    expect(mocks.error).toHaveBeenCalledWith('Done', undefined)
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('runs the handler of a lone Cancel button', () => {
    const onPress = vi.fn()
    Alert.alert('Heads up', undefined, [
      { text: 'Cancel', style: 'cancel', onPress },
    ])
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('asks a question with confirm and runs the action on OK', () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal('window', { confirm })
    const cancel = vi.fn()
    const action = vi.fn()
    Alert.alert('Reset?', 'Sure?', [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: 'Reset', onPress: action },
    ])
    expect(confirm).toHaveBeenCalledWith('Reset?\n\nSure?')
    expect(action).toHaveBeenCalledOnce()
    expect(cancel).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('runs Cancel when the User declines', () => {
    vi.stubGlobal('window', { confirm: () => false })
    const cancel = vi.fn()
    const action = vi.fn()
    Alert.alert('Reset?', undefined, [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: 'Reset', onPress: action },
    ])
    expect(cancel).toHaveBeenCalledOnce()
    expect(action).not.toHaveBeenCalled()
  })
})
