import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const haptics = vi.hoisted(() => ({
  light: vi.fn(),
  androidLongPress: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn() }))
const { slot, modifier } = vi.hoisted(() => ({
  slot: (name: string) => (props: React.PropsWithChildren) =>
    React.createElement(name, props),
  modifier:
    (name: string) =>
    (...args: unknown[]) => ({ name, args }),
}))

vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}))
vi.mock('@expo/ui', () => ({ Host: 'Host' }))
vi.mock('@expo/ui/swift-ui', () => ({
  Button: 'SwiftButton',
  ContextMenu: Object.assign(slot('ContextMenu'), {
    Items: slot('Items'),
    Trigger: slot('Trigger'),
  }),
  Divider: 'Divider',
  HStack: 'HStack',
  Image: 'Image',
  List: 'List',
  Menu: 'Menu',
  Picker: 'Picker',
  RNHostView: 'RNHostView',
  Section: 'Section',
  Spacer: 'Spacer',
  Text: 'SwiftText',
  Toggle: 'Toggle',
  VStack: 'VStack',
}))
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityAddTraits: modifier('accessibilityAddTraits'),
  accessibilityHidden: modifier('accessibilityHidden'),
  alignmentGuide: modifier('alignmentGuide'),
  background: modifier('background'),
  contentShape: modifier('contentShape'),
  disabled: modifier('disabled'),
  font: modifier('font'),
  foregroundStyle: modifier('foregroundStyle'),
  labelsHidden: modifier('labelsHidden'),
  listRowBackground: modifier('listRowBackground'),
  listStyle: modifier('listStyle'),
  opacity: modifier('opacity'),
  pickerStyle: modifier('pickerStyle'),
  scrollContentBackground: modifier('scrollContentBackground'),
  shapes: { rectangle: () => ({ shape: 'rectangle' }) },
  tag: modifier('tag'),
  tint: modifier('tint'),
}))
vi.mock('@expo/ui/jetpack-compose', () => ({
  Column: 'Column',
  DropdownMenu: Object.assign(slot('DropdownMenu'), {
    Trigger: slot('Trigger'),
    Items: slot('Items'),
  }),
  DropdownMenuItem: Object.assign(slot('DropdownMenuItem'), {
    Text: slot('ItemText'),
    TrailingIcon: slot('TrailingIcon'),
  }),
  HorizontalDivider: 'HorizontalDivider',
  Icon: 'ComposeIcon',
  LazyColumn: 'LazyColumn',
  ListItem: Object.assign(slot('ListItem'), {
    HeadlineContent: slot('HeadlineContent'),
    SupportingContent: slot('SupportingContent'),
    LeadingContent: slot('LeadingContent'),
    TrailingContent: slot('TrailingContent'),
  }),
  RNHostView: 'RNHostView',
  Row: 'Row',
  Text: 'ComposeText',
}))
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  alpha: modifier('alpha'),
  clip: modifier('clip'),
  clickable: modifier('clickable'),
  combinedClickable: modifier('combinedClickable'),
  fillMaxWidth: modifier('fillMaxWidth'),
  padding: modifier('padding'),
  selectable: modifier('selectable'),
  Shapes: { RoundedCorner: (corners: unknown) => corners },
  testID: modifier('testID'),
}))
vi.mock('@/assets/icons/check.xml', () => ({ default: 'check' }))
vi.mock('@/assets/compose-icons/arrow_drop_down.xml', () => ({
  default: 'arrowDropDown',
}))
vi.mock('@/assets/compose-icons/chevron_right.xml', () => ({
  default: 'chevronRight',
}))
vi.mock('@/assets/compose-icons/open_in_new.xml', () => ({
  default: 'openInNew',
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {
      accent: '#accent',
      accentTranslucent: '#accent33',
      background: '#bg',
      backgroundLighter: '#row',
      border: '#border',
      card: '#card',
      error: '#error',
      text: '#text',
      textAlt: '#alt',
    },
    fonts: {
      regular: 'Inter_400Regular',
      medium: 'Inter_500Medium',
      semiBold: 'Inter_600SemiBold',
    },
    fontSize: () => 14,
  }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (selector: (s: object) => unknown) =>
    selector({ colorScheme: 'dark', fontSizeOffset: 0 }),
}))
vi.mock('@/lib/haptics', () => ({ default: haptics }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/share', () => ({ shareUrl: vi.fn(async () => undefined) }))
vi.mock('expo-clipboard', () => clipboard)
vi.mock('@tamagui/toast', () => ({
  useToastController: () => ({ show: vi.fn() }),
}))
vi.mock('@/components/ui/InfoPopover', () => ({ default: 'InfoPopover' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/Switch', () => ({ default: 'Switch' }))

import * as Android from '@/components/ui/GroupedList.android'
import * as IOS from '@/components/ui/GroupedList.ios'

type Modifier = { name: string; args: unknown[] }

let root: ReactTestRenderer

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const render = async (element: React.ReactElement) => {
  await act(async () => {
    root = create(element)
  })
}

const find = (type: string) => root.root.findByType(type as never)
const findAll = (type: string) => root.root.findAllByType(type as never)
const modifiers = (node: { props: { modifiers?: Modifier[] } }) =>
  node.props.modifiers ?? []
const named = (node: { props: { modifiers?: Modifier[] } }, name: string) =>
  modifiers(node).find((m) => m.name === name)

const url = 'https://example.com/privacy'

describe('Android grouped list', () => {
  const { GroupedList, GroupedListSection, GroupedListRow } = Android

  it('rounds the group at its ends and presses through the row', async () => {
    const onPress = vi.fn()
    await render(
      <GroupedList title='Settings'>
        <GroupedListSection title='About'>
          <GroupedListRow label='One' onPress={onPress} />
          {null}
          <GroupedListRow label='Two' />
          <GroupedListRow label='Three' />
        </GroupedListSection>
      </GroupedList>
    )
    const rows = findAll('ListItem')
    expect(rows.map((row) => named(row, 'clip')?.args[0])).toEqual([
      { topStart: 20, topEnd: 20, bottomStart: 4, bottomEnd: 4 },
      { topStart: 4, topEnd: 4, bottomStart: 4, bottomEnd: 4 },
      { topStart: 4, topEnd: 4, bottomStart: 20, bottomEnd: 20 },
    ])
    expect(find('LazyColumn').props.contentPadding.bottom).toBe(16 + 34)

    const click = named(rows[0], 'clickable')!.args[0] as () => void
    click()
    expect(haptics.light).toHaveBeenCalledOnce()
    expect(onPress).toHaveBeenCalledOnce()
    expect(named(rows[1], 'clickable')).toBeUndefined()
    expect(findAll('ComposeIcon').map((icon) => icon.props.source)).toEqual([
      'chevronRight',
    ])
  })

  it('notes the group under its rows', async () => {
    await render(
      <GroupedListSection footer='Applies to every row'>
        <GroupedListRow label='One' />
      </GroupedListSection>
    )
    const texts = findAll('ComposeText').map((text) => text.props.children)
    expect(texts[texts.length - 1]).toBe('Applies to every row')
  })

  it('opens a link row’s menu on long press and copies the link', async () => {
    const onPress = vi.fn()
    await render(
      <GroupedListRow
        label='Privacy'
        url={url}
        onPress={onPress}
        accessory='external'
      />
    )
    const menu = () => find('DropdownMenu')
    expect(menu().props.expanded).toBe(false)
    const gestures = named(find('ListItem'), 'combinedClickable')!.args[0] as {
      onClick: () => void
      onLongClick: () => void
    }
    await act(async () => gestures.onLongClick())
    expect(haptics.androidLongPress).toHaveBeenCalledOnce()
    expect(menu().props.expanded).toBe(true)
    expect(
      findAll('ComposeText')
        .slice(1)
        .map((text) => text.props.children)
    ).toEqual(['open', 'copyLink', 'shareEllipsis'])

    await act(async () => findAll('DropdownMenuItem')[1].props.onClick())
    expect(clipboard.setStringAsync).toHaveBeenCalledWith(url)
    expect(menu().props.expanded).toBe(false)

    gestures.onClick()
    expect(onPress).toHaveBeenCalledOnce()
    expect(
      findAll('ComposeIcon').find((icon) => icon.props.source === 'openInNew')
    ).toBeTruthy()
  })

  it('dims a disabled row and drops its press and menu', async () => {
    await render(
      <GroupedListRow label='Notes' url={url} onPress={vi.fn()} disabled />
    )
    expect(findAll('DropdownMenu')).toHaveLength(0)
    const row = find('ListItem')
    expect(named(row, 'clickable')).toBeUndefined()
    expect(named(row, 'combinedClickable')).toBeUndefined()
    expect(named(row, 'alpha')?.args).toEqual([0.4])
  })

  it('tints the selected row and marks it selected', async () => {
    const onPress = vi.fn()
    await render(<GroupedListRow label='Profile' onPress={onPress} selected />)
    const row = find('ListItem')
    expect(row.props.colors.containerColor).toBe('#accent33')
    expect(named(row, 'selectable')?.args[0]).toBe(true)
  })

  it('says which choice is chosen without tinting it', async () => {
    const onPress = vi.fn()
    await render(<GroupedListRow label='Name' onPress={onPress} checked />)
    const row = find('ListItem')
    expect(row.props.colors.containerColor).not.toBe('#accent33')
    expect(named(row, 'selectable')?.args.slice(0, 1)).toEqual([true])
    expect(named(row, 'selectable')?.args[2]).toBe('radioButton')
    await act(async () =>
      root.update(
        <GroupedListRow label='Name' onPress={onPress} checked={false} />
      )
    )
    expect(named(find('ListItem'), 'selectable')?.args[0]).toBe(false)
  })

  it('toggles only through the switch, beside its info button', async () => {
    const onValueChange = vi.fn()
    await render(
      <Android.GroupedListSwitchRow
        label='Developer Tools'
        info='More tools'
        value={false}
        onValueChange={onValueChange}
      />
    )
    const row = find('ListItem')
    expect(named(row, 'clickable')).toBeUndefined()
    const toggle = find('Switch')
    expect(toggle.props.value).toBe(false)
    expect(toggle.props.accessibilityLabel).toBe('Developer Tools')
    toggle.props.onValueChange(true)
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(true)
    expect(find('InfoPopover').props.title).toBe('Developer Tools')
  })

  it('shows the current choice and reports only a new one', async () => {
    const onChange = vi.fn()
    await render(
      <Android.GroupedListPickerRow
        label='Language'
        options={[
          { value: 'device', label: 'Device default' },
          { value: 'es', label: 'Español' },
        ]}
        value='device'
        onChange={onChange}
      />
    )
    expect(findAll('ComposeText').map((text) => text.props.children)).toContain(
      'Device default'
    )
    const menu = () => find('DropdownMenu')
    await act(async () =>
      (named(find('ListItem'), 'clickable')!.args[0] as () => void)()
    )
    expect(menu().props.expanded).toBe(true)
    expect(findAll('TrailingIcon')).toHaveLength(1)

    await act(async () => findAll('DropdownMenuItem')[0].props.onClick())
    expect(onChange).not.toHaveBeenCalled()
    expect(menu().props.expanded).toBe(false)

    await act(async () => findAll('DropdownMenuItem')[1].props.onClick())
    expect(onChange).toHaveBeenCalledExactlyOnceWith('es')
  })
})

describe('iOS grouped list', () => {
  const { GroupedList, GroupedListSection, GroupedListRow } = IOS

  it('styles an inset grouped list and presses through a row', async () => {
    const onPress = vi.fn()
    await render(
      <GroupedList title='Settings'>
        <GroupedListSection title='About'>
          <GroupedListRow label='Preferences' onPress={onPress} />
        </GroupedListSection>
      </GroupedList>
    )
    const list = find('List')
    expect(named(list, 'listStyle')?.args).toEqual(['insetGrouped'])
    expect(named(list, 'background')?.args).toEqual(['#bg'])
    expect(findAll('Section')).toHaveLength(2)

    const button = find('SwiftButton')
    expect(named(button, 'listRowBackground')?.args).toEqual(['#row'])
    const chevron = find('Image')
    // `forward` points left in a right-to-left Language.
    expect(chevron.props.systemName).toBe('chevron.forward')
    expect(named(chevron, 'accessibilityHidden')?.args).toEqual([true])
    button.props.onPress()
    expect(haptics.light).toHaveBeenCalledOnce()
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('notes the group in its footer', async () => {
    await render(
      <GroupedListSection footer='Applies to every row'>
        <GroupedListRow label='One' />
      </GroupedListSection>
    )
    const footer = find('Section').props.footer as React.ReactElement<{
      children: string
    }>
    expect(footer.props.children).toBe('Applies to every row')
  })

  it('lifts a link row into a context menu with the link actions', async () => {
    await render(
      <GroupedListRow
        label='Privacy'
        url={url}
        onPress={vi.fn()}
        accessory='external'
      />
    )
    const menu = find('ContextMenu')
    expect(named(menu, 'listRowBackground')?.args).toEqual(['#row'])
    const items = findAll('SwiftButton').filter((b) => b.props.label)
    expect(items.map((b) => b.props.label)).toEqual([
      'open',
      'copyLink',
      'shareEllipsis',
    ])
    expect(
      named(
        find('Trigger').findByType('SwiftButton' as never),
        'listRowBackground'
      )
    ).toBeUndefined()
    await act(async () => items[1].props.onPress())
    expect(clipboard.setStringAsync).toHaveBeenCalledWith(url)
    expect(find('Image').props.systemName).toBe('arrow.up.right.square')
  })

  it('tints the selected row and marks it selected', async () => {
    await render(<GroupedListRow label='Profile' onPress={vi.fn()} selected />)
    const button = find('SwiftButton')
    expect(named(button, 'listRowBackground')?.args).toEqual(['#accent33'])
    expect(named(button, 'accessibilityAddTraits')?.args).toEqual([
      ['isSelected'],
    ])
  })

  it('says which choice is chosen without tinting it', async () => {
    await render(<GroupedListRow label='Name' onPress={vi.fn()} checked />)
    const button = find('SwiftButton')
    expect(named(button, 'listRowBackground')?.args).not.toEqual(['#accent33'])
    expect(named(button, 'accessibilityAddTraits')?.args).toEqual([
      ['isSelected'],
    ])
  })

  it('reports the toggle and picker choices', async () => {
    const onValueChange = vi.fn()
    const onChange = vi.fn()
    await render(
      <GroupedListSection>
        <IOS.GroupedListSwitchRow
          label='Developer Tools'
          value
          onValueChange={onValueChange}
        />
        <IOS.GroupedListPickerRow
          label='Language'
          options={[
            { value: 'device', label: 'Device default' },
            { value: 'es', label: 'Español' },
          ]}
          value='device'
          onChange={onChange}
        />
      </GroupedListSection>
    )
    const toggle = find('Toggle')
    expect(toggle.props.isOn).toBe(true)
    expect(toggle.props.label).toBe('Developer Tools')
    expect(named(toggle, 'labelsHidden')).toBeTruthy()
    toggle.props.onIsOnChange(false)
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(false)

    const picker = find('Picker')
    expect(picker.props.selection).toBe('device')
    expect(named(picker, 'pickerStyle')?.args).toEqual(['menu'])
    picker.props.onSelectionChange('es')
    expect(onChange).toHaveBeenCalledExactlyOnceWith('es')
  })
})
