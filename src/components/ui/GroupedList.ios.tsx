import { Fragment, type ReactElement } from 'react'
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
  Toggle,
  VStack,
} from '@expo/ui/swift-ui'
import {
  accessibilityAddTraits,
  accessibilityHidden,
  alignmentGuide,
  background,
  contentShape,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  labelsHidden,
  listRowBackground,
  listStyle,
  opacity,
  pickerStyle,
  scrollContentBackground,
  shapes,
  tag,
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
import type {
  ContextMenuAction,
  ContextMenuItem,
} from '@/components/ui/ContextMenu.types'
import type {
  GroupedListPickerRowProps,
  GroupedListProps,
  GroupedListRowProps,
  GroupedListSectionProps,
  GroupedListSwitchRowProps,
} from '@/components/ui/GroupedList.types'

const ICON_GAP = 12

/**
 * Starts a row's separator at its label, as SwiftUI does past a leading SF
 * Symbol. The List reads the guide from the row's outermost view.
 */
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
  // The theme's faces, so rows follow Bold Text like the rest of the app.
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

/**
 * A SwiftUI inset grouped `List` that owns the scroll, in the app's colors and
 * fonts.
 */
export function GroupedList({ children, title, testID }: GroupedListProps) {
  const style = useRowStyle()
  const { theme } = style
  const colorScheme = usePreferences((s) => s.colorScheme)

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Host
        style={{
          flex: 1,
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
        }}
        colorScheme={colorScheme}
        seedColor={theme.colors.accent}
      >
        <List
          testID={testID}
          modifiers={[
            listStyle('insetGrouped'),
            scrollContentBackground('hidden'),
            background(theme.colors.background),
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

/** A Lucide icon hosted at its own size, so SwiftUI doesn't stretch it. */
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
          {/* One native child: the popover mounts its own Modal beside the button. */}
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

/**
 * A row that opens a screen, a website or an action. Long press lifts the row
 * with its context menu, as rows do in Settings.
 */
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
  disabled,
  selected,
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
    ...(selected ? [accessibilityAddTraits(['isSelected'])] : []),
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
            // Explicit, since a button's label inherits the accent tint.
            foregroundStyle(theme.colors.textAlt),
            // The row's label already says where it goes.
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

/**
 * The label, its info button and the switch stay separate controls, as in
 * Settings: only the switch toggles.
 */
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

/** A menu of choices; the row shows the current one, as a Settings picker does. */
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
      {/* Outside the picker: SwiftUI also draws a picker's label elsewhere,
          and a hosted view can only show in one place. */}
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
