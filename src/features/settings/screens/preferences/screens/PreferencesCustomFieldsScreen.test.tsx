import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dataProtectionMode: true,
  addCustomFieldDef: vi.fn(),
  renameCustomFieldDef: vi.fn(),
  customFieldDefs: [{ id: 'field', label: 'Best time', order: 0 }],
}))
vi.mock('lucide-react-native', () => ({
  Archive: 'Archive',
  RotateCcw: 'RotateCcw',
  Trash2: 'Trash2',
}))
vi.mock('react-native', () => ({ View: 'View', Switch: 'Switch' }))
vi.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: 'ScrollView',
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, fontSize: () => 12 }),
}))
vi.mock('@/stores/contactsStore', () => ({ default: () => mocks }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (selector?: (state: typeof mocks) => unknown) =>
    selector ? selector(mocks) : mocks,
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/confirmDestructive', () => ({ default: vi.fn() }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/TextInput', () => ({ default: 'Input' }))
vi.mock('@/components/ui/ActionButton', () => ({ default: 'ActionButton' }))
vi.mock('@/components/ui/layout/Wrapper', () => ({ default: 'Wrapper' }))
vi.mock('@/components/ui/inputs/Section', () => ({ default: 'Section' }))
vi.mock('@/components/ui/inputs/InputRowContainer', () => ({
  default: 'InputRowContainer',
}))
vi.mock('@/components/RowActionsMenu', () => ({ default: 'RowActionsMenu' }))
vi.mock('@/features/settings/components/shared/SettingsInputLayout', () => ({
  default: 'SettingsInputLayout',
}))
vi.mock('@/features/settings/components/shared/SectionTitle', () => ({
  default: 'SectionTitle',
}))
vi.mock('@/features/settings/components/shared/ReorderControls', () => ({
  default: 'ReorderControls',
}))

import PreferencesCustomFieldsScreen from './PreferencesCustomFieldsScreen'
import MyTextInput from '@/components/ui/TextInput'
import ActionButton from '@/components/ui/ActionButton'
import Text from '@/components/ui/MyText'

let root: ReturnType<typeof create>
const warnings = () =>
  root.root
    .findAllByType(Text)
    .filter((node) => node.props.children === 'dataProtectionNoteHint')
beforeEach(async () => {
  vi.clearAllMocks()
  mocks.dataProtectionMode = true
  await act(async () => {
    root = create(<PreferencesCustomFieldsScreen />)
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
})

it('warns while typing and still adds the sensitive field', async () => {
  expect(warnings()).toHaveLength(0)
  await act(async () =>
    root.root.findAllByType(MyTextInput)[0].props.onChangeText('Ethnicity')
  )
  expect(warnings()).toHaveLength(1)
  expect(root.root.findByType(ActionButton).props.disabled).toBe(false)
  await act(async () => root.root.findByType(ActionButton).props.onPress())
  expect(mocks.addCustomFieldDef).toHaveBeenCalledWith('Ethnicity')
  expect(warnings()).toHaveLength(0)
})

it('updates warnings during rename without blocking persistence', async () => {
  const edit = async (text: string) =>
    act(async () =>
      root.root.findAllByType(MyTextInput)[1].props.onChangeText(text)
    )
  await edit('Religion')
  expect(warnings()).toHaveLength(1)
  await edit('Best time')
  expect(warnings()).toHaveLength(0)
  await edit('Health')
  await act(async () =>
    root.root.findAllByType(MyTextInput)[1].props.onEndEditing()
  )
  expect(mocks.renameCustomFieldDef).toHaveBeenCalledWith('field', 'Health')
})

it('does not show privacy warnings with GDPR mode off', async () => {
  mocks.dataProtectionMode = false
  await act(async () =>
    root.root.findAllByType(MyTextInput)[0].props.onChangeText('Ethnicity')
  )
  expect(warnings()).toHaveLength(0)
})
