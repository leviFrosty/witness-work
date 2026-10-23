import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ dispatch: vi.fn() }))

vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }))
vi.mock('@react-navigation/native', () => ({
  CommonActions: { navigate: (args: unknown) => ({ type: 'NAVIGATE', args }) },
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/features/contacts/lib/linking', () => ({
  navigationRef: { dispatch: runtime.dispatch },
}))
vi.mock('@/features/updates/lib/updates', () => ({ fetchUpdate: vi.fn() }))
vi.mock('@/lib/links', () => ({ openURL: vi.fn() }))
vi.mock('@/constants/contactInformation', () => ({ email: 'help@example.com' }))

import { menuGroups, runMenuCommand } from '@/app/menu-bar/menuCommands'

const fileActions = (showsScribe: boolean) =>
  menuGroups({
    showsTimeEntry: true,
    showsScribe,
    checkingUpdate: false,
    language: 'en-us',
  })
    .find((group) => group.id === 'file')
    ?.actions.map((action) => action.id)

describe('menu bar: Speak an update', () => {
  beforeEach(() => vi.clearAllMocks())

  it('leads File while Scribe AI shows, and is gone while it is hidden', () => {
    expect(fileActions(true)?.[0]).toBe('speak_update')
    expect(fileActions(false)).not.toContain('speak_update')
  })

  it('opens Scribe AI the way the other entry points do', async () => {
    const openScribe = vi.fn()
    await runMenuCommand('speak_update', true, openScribe)
    expect(openScribe).toHaveBeenCalledTimes(1)
    expect(runtime.dispatch).not.toHaveBeenCalled()
  })
})
