import {
  Fragment,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactElement,
} from 'react'
import { View } from 'react-native'
import { Host } from '@expo/ui'
import {
  Button,
  ContextMenu,
  Divider,
  HStack,
  Image,
  List,
  Menu,
  Picker,
  RNHostView,
  Section,
  Spacer,
  Text,
  TextField,
  type TextFieldRef,
  Toggle,
  useNativeState,
  VStack,
} from '@expo/ui/swift-ui'
import {
  accessibilityAddTraits,
  accessibilityHidden,
  accessibilityLabel,
  alignmentGuide,
  background,
  buttonStyle,
  contentShape,
  disabled as disabledModifier,
  environment,
  font,
  foregroundStyle,
  frame,
  labelsHidden,
  listRowBackground,
  listRowInsets,
  listStyle,
  opacity,
  pickerStyle,
  scrollContentBackground,
  onSubmit,
  shapes,
  submitLabel,
  tag,
  textInputAutocapitalization,
  tint as tintModifier,
} from '@expo/ui/swift-ui/modifiers'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import Haptics from '@/lib/haptics'
import useLinkMenuActions from '@/hooks/useLinkMenuActions'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { isSubmenu, menuGroups } from '@/components/ui/menuEntries'
import { postScriptName } from '@/lib/postScriptName'
import { droppedIndex } from '@/lib/reorder'
import type {
  ContextMenuAction,
  ContextMenuEntries,
  ContextMenuItem,
} from '@/components/ui/ContextMenu.types'
import type {
  GroupedListPickerRowProps,
  GroupedListProps,
  GroupedListReorderSectionProps,
  GroupedListRowProps,
  GroupedListSectionProps,
  GroupedListSwitchRowProps,
  GroupedListTextFieldRowProps,
} from '@/components/ui/GroupedList.types'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'

const ICON_GAP = 12

const separatorModifiers = (icon?: AppIcon) =>
  icon
    ? [
        alignmentGuide(
          'listRowSeparatorLeading',
          inputLayout.iconSize + ICON_GAP
        ),
      ]
    : []

function useRowStyle() {
  const theme = useTheme()
  const fontSizeOffset = usePreferences((s) => s.fontSizeOffset)
  const size = (step: Parameters<typeof theme.fontSize>[0]) =>
    theme.fontSize(step) + fontSizeOffset

  const fonts = {
    regular: postScriptName(theme.fonts.regular),
    medium: postScriptName(theme.fonts.medium),
    semiBold: postScriptName(theme.fonts.semiBold),
  }

  return {
    theme,
    label: [
      font({ family: fonts.medium, size: size('md'), textStyle: 'body' }),
      foregroundStyle(theme.colors.text),
    ],
    sublabel: [
      font({
        family: fonts.regular,
        size: size('sm'),
        textStyle: 'subheadline',
      }),
      foregroundStyle(theme.colors.textAlt),
    ],
    header: [
      font({
        family: fonts.semiBold,
        size: size('sm'),
        textStyle: 'footnote',
      }),
      foregroundStyle(theme.colors.textAlt),
    ],
    title: [
      font({ family: fonts.semiBold, size: size('xl'), textStyle: 'title2' }),
      foregroundStyle(theme.colors.text),
    ],
    rowBackground: theme.colors.backgroundLighter,
  }
}

export function GroupedList({
  children,
  title,
  header,
  banner,
  editing,
  testID,
}: GroupedListProps) {
  const foldColumn = useFoldColumn(inputLayout.contentMaxWidth)
  const style = useRowStyle()
  const { theme } = style
  const colorScheme = usePreferences((s) => s.colorScheme)

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Host
        style={[
          {
            flex: 1,
            width: '100%',
            maxWidth: inputLayout.contentMaxWidth,
            alignSelf: 'center',
          },
          foldColumn,
        ]}
        colorScheme={colorScheme}
        seedColor={theme.colors.accent}
      >
        <List
          testID={testID}
          modifiers={[
            listStyle('insetGrouped'),
            scrollContentBackground('hidden'),
            background(theme.colors.background),
            ...(editing ? [environment('editMode', 'active')] : []),
          ]}
        >
          {title ? (
            <Section
              header={
                <Text
                  modifiers={[
                    ...style.title,
                    accessibilityAddTraits(['isHeader']),
                  ]}
                >
                  {title}
                </Text>
              }
            >
              {null}
            </Section>
          ) : null}
          {header ? (
            <Section
              header={
                <HStack>
                  <Spacer />
                  <RNHostView matchContents>
                    <View>{header}</View>
                  </RNHostView>
                  <Spacer />
                </HStack>
              }
            >
              {null}
            </Section>
          ) : null}
          {banner ? (
            <Section
              header={
                <HStack
                  modifiers={[listRowInsets({ leading: 0, trailing: 0 })]}
                >
                  <RNHostView matchContents={{ vertical: true }}>
                    <View>{banner}</View>
                  </RNHostView>
                </HStack>
              }
            >
              {null}
            </Section>
          ) : null}
          {children}
        </List>
      </Host>
    </View>
  )
}

export function GroupedListSection({
  title,
  footer,
  children,
}: GroupedListSectionProps) {
  const style = useRowStyle()

  return (
    <Section
      header={
        title ? (
          <Text
            modifiers={[...style.header, accessibilityAddTraits(['isHeader'])]}
          >
            {title}
          </Text>
        ) : undefined
      }
      footer={
        footer ? <Text modifiers={style.sublabel}>{footer}</Text> : undefined
      }
    >
      {children}
    </Section>
  )
}

export function GroupedListReorderSection<T>({
  title,
  footer,
  data,
  keyExtractor,
  onMove,
  children,
}: GroupedListReorderSectionProps<T>) {
  return (
    <GroupedListSection title={title} footer={footer}>
      <List.ForEach
        data={data}
        keyExtractor={keyExtractor}
        recycling={false}
        onMove={(sources, destination) => {
          const move = droppedIndex(sources, destination)
          if (move) onMove(move.from, move.to)
        }}
      >
        {({ item, index }) => children(item, index)}
      </List.ForEach>
    </GroupedListSection>
  )
}

function RowIcon({
  icon,
  color,
  fill,
}: {
  icon: AppIcon
  color: string
  fill?: string
}) {
  return (
    <RNHostView matchContents>
      <View
        pointerEvents='none'
        style={{ width: inputLayout.iconSize, height: inputLayout.iconSize }}
      >
        <LucideIcon
          icon={icon}
          size={inputLayout.iconSize}
          color={color}
          fill={fill}
        />
      </View>
    </RNHostView>
  )
}

function RowText({ label, sublabel }: { label: string; sublabel?: string }) {
  const style = useRowStyle()
  return (
    <VStack alignment='leading' spacing={2}>
      <Text modifiers={style.label}>{label}</Text>
      {sublabel ? <Text modifiers={style.sublabel}>{sublabel}</Text> : null}
    </VStack>
  )
}

function RowLabel({
  icon,
  iconColor,
  iconFill,
  label,
  sublabel,
  info,
}: {
  icon?: AppIcon
  iconColor?: string
  iconFill?: string
  label: string
  sublabel?: string
  info?: string
}) {
  const style = useRowStyle()
  const { theme } = style

  return (
    <HStack spacing={ICON_GAP}>
      {icon ? (
        <RowIcon
          icon={icon}
          color={iconColor ?? theme.colors.textAlt}
          fill={iconFill}
        />
      ) : null}
      <RowText label={label} sublabel={sublabel} />
      {info ? (
        <RNHostView matchContents>
          {}
          <View>
            <InfoPopover title={label} description={info} />
          </View>
        </RNHostView>
      ) : null}
    </HStack>
  )
}

const menuButton = (action: ContextMenuAction, key: string) => (
  <Button
    key={key}
    label={action.title}
    systemImage={action.systemImage}
    role={action.destructive ? 'destructive' : undefined}
    onPress={() => action.onPress()}
  />
)

const menuItems = (groups: ContextMenuItem[][]) =>
  groups.map((group, index) => (
    <Fragment key={index}>
      {index > 0 ? <Divider /> : null}
      {group.map((item) =>
        isSubmenu(item) ? (
          <Menu key={item.id} label={item.title} systemImage={item.systemImage}>
            {item.actions.map((action) =>
              menuButton(action, `${item.id}.${action.id}`)
            )}
          </Menu>
        ) : (
          menuButton(item, item.id)
        )
      )}
    </Fragment>
  ))

function RowMenu({
  label,
  actions,
}: {
  label: string
  actions?: ContextMenuEntries
}) {
  const theme = useTheme()
  const groups = menuGroups(actions ?? [])
  if (!groups.length) return null
  return (
    <Menu
      label={
        <Image
          systemName='ellipsis.circle'
          modifiers={[
            font({ textStyle: 'body' }),
            foregroundStyle(theme.colors.textAlt),
            frame({ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET }),
            contentShape(shapes.rectangle()),
            accessibilityHidden(true),
          ]}
        />
      }
      modifiers={[buttonStyle('borderless'), accessibilityLabel(label)]}
    >
      {menuItems(groups)}
    </Menu>
  )
}

export function GroupedListRow({
  label,
  sublabel,
  icon,
  iconColor,
  iconFill,
  onPress,
  accessory = onPress ? 'chevron' : 'none',
  trailing,
  url,
  contextActions,
  menuActions,
  menuLabel,
  disabled,
  selected,
  checked,
  tint,
  testID,
}: GroupedListRowProps) {
  const style = useRowStyle()
  const { theme } = style
  const linkActions = useLinkMenuActions({ url, label, onOpen: onPress })
  const groups = disabled
    ? []
    : menuGroups([...linkActions, ...(contextActions ?? [])])

  const rowModifiers = [
    listRowBackground(
      selected ? theme.colors.accentTranslucent : (tint ?? style.rowBackground)
    ),
    ...separatorModifiers(icon),
    ...(selected || checked ? [accessibilityAddTraits(['isSelected'])] : []),
  ]

  const content: ReactElement = (
    <HStack
      spacing={ICON_GAP}
      modifiers={[
        contentShape(shapes.rectangle()),
        ...(disabled ? [opacity(0.4)] : []),
      ]}
    >
      <RowLabel
        icon={icon}
        iconColor={iconColor}
        iconFill={iconFill}
        label={label}
        sublabel={sublabel}
      />
      <Spacer />
      {trailing ? (
        <RNHostView matchContents>
          <View pointerEvents='none'>{trailing}</View>
        </RNHostView>
      ) : null}
      {disabled ? null : (
        <RowMenu label={menuLabel ?? label} actions={menuActions} />
      )}
      {accessory !== 'none' ? (
        <Image
          systemName={
            accessory === 'external'
              ? 'arrow.up.right.square'
              : 'chevron.forward'
          }
          modifiers={[
            font({
              textStyle: 'footnote',
              weight: accessory === 'external' ? 'regular' : 'semibold',
            }),

            foregroundStyle(theme.colors.textAlt),

            accessibilityHidden(true),
          ]}
        />
      ) : null}
    </HStack>
  )

  const row = onPress ? (
    <Button
      testID={testID}
      onPress={() => {
        Haptics.light()
        onPress()
      }}
      modifiers={[
        ...(groups.length ? [] : rowModifiers),
        disabledModifier(!!disabled),
      ]}
    >
      {content}
    </Button>
  ) : (
    <HStack
      testID={testID}
      modifiers={groups.length ? undefined : rowModifiers}
    >
      {content}
    </HStack>
  )

  if (!groups.length) return row

  return (
    <ContextMenu modifiers={rowModifiers}>
      <ContextMenu.Items>{menuItems(groups)}</ContextMenu.Items>
      <ContextMenu.Trigger>{row}</ContextMenu.Trigger>
    </ContextMenu>
  )
}

export function GroupedListSwitchRow({
  label,
  icon,
  info,
  value,
  onValueChange,
  disabled,
  testID,
}: GroupedListSwitchRowProps) {
  const style = useRowStyle()

  return (
    <HStack
      spacing={ICON_GAP}
      modifiers={[
        listRowBackground(style.rowBackground),
        ...separatorModifiers(icon),
      ]}
    >
      <RowLabel icon={icon} label={label} info={info} />
      <Spacer />
      <Toggle
        testID={testID}
        label={label}
        isOn={value}
        onIsOnChange={onValueChange}
        modifiers={[
          labelsHidden(),
          tintModifier(style.theme.colors.accent),
          disabledModifier(!!disabled),
        ]}
      />
    </HStack>
  )
}

export function GroupedListPickerRow({
  label,
  sublabel,
  icon,
  options,
  value,
  onChange,
  testID,
}: GroupedListPickerRowProps) {
  const style = useRowStyle()

  return (
    <HStack
      spacing={ICON_GAP}
      modifiers={[
        listRowBackground(style.rowBackground),
        ...separatorModifiers(icon),
      ]}
    >
      {}
      {icon ? <RowIcon icon={icon} color={style.theme.colors.textAlt} /> : null}
      <Picker
        testID={testID}
        selection={value}
        onSelectionChange={(selection) => onChange(String(selection))}
        label={<RowText label={label} sublabel={sublabel} />}
        modifiers={[
          pickerStyle('menu'),
          tintModifier(style.theme.colors.textAlt),
        ]}
      >
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </HStack>
  )
}

export function GroupedListTextFieldRow({
  value,
  onChangeText,
  onEndEditing,
  accessibilityLabel: label,
  placeholder,
  maxLength,
  autoCapitalize = 'words',
  invalid,
  sublabel,
  action,
  menuActions,
  menuLabel,
  ref,
  testID,
}: GroupedListTextFieldRowProps) {
  const style = useRowStyle()
  const { theme } = style
  const text = useNativeState(value)
  const field = useRef<TextFieldRef>(null)
  const typed = useRef(value)
  useEffect(() => {
    if (value === typed.current) return
    typed.current = value
    text.set(value)
  }, [value, text])
  useImperativeHandle(ref, () => ({ focus: () => void field.current?.focus() }))

  return (
    <HStack
      spacing={ICON_GAP}
      modifiers={[listRowBackground(style.rowBackground)]}
    >
      <VStack alignment='leading' spacing={2}>
        <TextField
          ref={field}
          testID={testID}
          text={text}
          maxLength={maxLength}
          onTextChange={(next) => {
            typed.current = next
            onChangeText(next)
          }}
          onFocusChange={(focused) => {
            if (!focused) onEndEditing?.()
          }}
          modifiers={[
            ...style.label,
            accessibilityLabel(label),
            textInputAutocapitalization(autoCapitalize),
            submitLabel('done'),
            ...(action ? [onSubmit(action.onPress)] : []),
          ]}
        >
          {placeholder ? (
            <TextField.Placeholder>
              <Text
                modifiers={[
                  foregroundStyle(
                    invalid ? theme.colors.error : theme.colors.textAlt
                  ),
                ]}
              >
                {placeholder}
              </Text>
            </TextField.Placeholder>
          ) : null}
        </TextField>
        {sublabel ? <Text modifiers={style.sublabel}>{sublabel}</Text> : null}
      </VStack>
      {action ? (
        <Button
          onPress={() => {
            Haptics.light()
            action.onPress()
          }}
          modifiers={[buttonStyle('borderless')]}
        >
          <Text
            modifiers={[
              font({ family: postScriptName(theme.fonts.semiBold) }),
              foregroundStyle(theme.colors.accent),
              frame({
                minWidth: MIN_TOUCH_TARGET,
                minHeight: MIN_TOUCH_TARGET,
              }),
              contentShape(shapes.rectangle()),
            ]}
          >
            {action.label}
          </Text>
        </Button>
      ) : null}
      <RowMenu label={menuLabel ?? label} actions={menuActions} />
    </HStack>
  )
}
