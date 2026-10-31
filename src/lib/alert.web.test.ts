import { afterEach, describe, expect, it, vi } from 'vitest'
import { showAlert } from './alert.web'

const confirm = vi.fn<(text: string) => boolean>()
const alert = vi.fn<(text: string) => void>()
vi.stubGlobal('window', { confirm, alert })

afterEach(() => {
  confirm.mockReset()
  alert.mockReset()
})

describe('alerts on the web', () => {
  it('asks with the browser’s confirm, running the action on OK', () => {
    const onPress = vi.fn()
    const onCancel = vi.fn()
    confirm.mockReturnValue(true)
    showAlert('Sign out?', 'It signs in again with a passkey.', [
      { text: 'Cancel', style: 'cancel', onPress: onCancel },
      { text: 'Sign Out', style: 'destructive', onPress },
    ])
    expect(confirm).toHaveBeenCalledWith(
      'Sign out?\n\nIt signs in again with a passkey.'
    )
    expect(onPress).toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('runs Cancel when the User cancels', () => {
    const onPress = vi.fn()
    const onCancel = vi.fn()
    confirm.mockReturnValue(false)
    showAlert('Discard?', undefined, [
      { text: 'Not Now', style: 'cancel', onPress: onCancel },
      { text: 'Discard', onPress },
    ])
    expect(confirm).toHaveBeenCalledWith('Discard?')
    expect(onPress).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows a notice with the browser’s alert', () => {
    showAlert('Done', 'All set.')
    expect(alert).toHaveBeenCalledWith('Done\n\nAll set.')
    expect(confirm).not.toHaveBeenCalled()
  })
})
