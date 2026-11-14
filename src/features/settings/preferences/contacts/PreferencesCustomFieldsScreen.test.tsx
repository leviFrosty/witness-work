import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dataProtectionMode: true,
  addCustomFieldDef: vi.fn(),
  renameCustomFieldDef: vi.fn(),
  reorderCustomFieldDefs: vi.fn(),
  set: vi.fn(),
  customFieldDefs: [{ id: 'field', label: 'Best time', order: 0 }],
}))
vi.mock('@/stores/contactsStore', () => ({ default: () => mocks }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (selector?: (state: typeof mocks) => unknown) =>
    selector ? selector(mocks) : mocks,
}))
vi.mock('@/hooks/useFormValidation', () => ({
  default: (errors: Record<string, boolean>) => ({
    validate: () => !Object.values(errors).some(Boolean),
    invalid: () => false,
  }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/confirmDestructive', () => ({ default: vi.fn() }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, fontSize: () => 12 }),
}))
vi.mock('@/components/ui/GroupedList', () => ({
  GroupedList: 'GroupedList',
  GroupedListSection: 'GroupedListSection',
  GroupedListRow: 'GroupedListRow',
  GroupedListSwitchRow: 'GroupedListSwitchRow',
  GroupedListTextFieldRow: 'GroupedListTextFieldRow',
  GroupedListReorderSection: ({
    data,
    keyExtractor,
    children,
    ...props
  }: {
    data: unknown[]
    keyExtractor: (item: unknown) => string
    children: (item: unknown, index: number) => React.ReactElement
  }) =>
    React.createElement(
      'GroupedListReorderSection',
      props,
      data.map((item, index) =>
        React.cloneElement(children(item, index), { key: keyExtractor(item) })
      )
    ),
}))

import PreferencesCustomFieldsScreen from './PreferencesCustomFieldsScreen'

let root: ReturnType<typeof create>
const fields = () => root.root.findAllByType('GroupedListTextFieldRow' as never)
const warnings = () =>
  root.root
    .findAll((node) => typeof node.type === 'string')
    .filter((node) => node.props.footer === 'dataProtectionNoteHint')

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
  await act(async () => fields()[0].props.onChangeText('Ethnicity'))
  expect(warnings()).toHaveLength(1)
  await act(async () => fields()[0].props.action.onPress())
  expect(mocks.addCustomFieldDef).toHaveBeenCalledWith('Ethnicity')
  expect(warnings()).toHaveLength(0)
})

it('updates warnings during rename without blocking persistence', async () => {
  const edit = async (text: string) =>
    act(async () => fields()[1].props.onChangeText(text))
  await edit('Religion')
  expect(warnings()).toHaveLength(1)
  await edit('Best time')
  expect(warnings()).toHaveLength(0)
  await edit('Health')
  await act(async () => fields()[1].props.onEndEditing())
  expect(mocks.renameCustomFieldDef).toHaveBeenCalledWith('field', 'Health')
})

it('does not show privacy warnings with GDPR mode off', async () => {
  mocks.dataProtectionMode = false
  await act(async () => fields()[0].props.onChangeText('Ethnicity'))
  expect(warnings()).toHaveLength(0)
})

it('saves a dragged order for contact fields and custom fields', async () => {
  const section = root.root.findByType('GroupedListReorderSection' as never)
  const ids = section.props.children.map(
    (row: React.ReactElement) => row.key
  ) as string[]
  expect(ids).toEqual(['phone', 'email', 'custom:field'])
  await act(async () => section.props.onMove(2, 0))
  expect(mocks.set).toHaveBeenCalledWith({
    contactInformationOrder: ['custom:field', 'phone', 'email'],
  })
  expect(mocks.reorderCustomFieldDefs).toHaveBeenCalledWith(['field'])
})
