import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  use,
  useState,
} from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Host } from '@expo/ui'
import {
  Column,
  DropdownMenu,
  DropdownMenuItem,
  HorizontalDivider,
  Icon,
  LazyColumn,
  ListItem,
  RNHostView,
  Row,
  Text,
} from '@expo/ui/jetpack-compose'
import {
  alpha,
  clip,
  clickable,
  combinedClickable,
  fillMaxWidth,
  padding,
  selectable,
  Shapes,
  testID as testTag,
  type ModifierConfig,
} from '@expo/ui/jetpack-compose/modifiers'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import Haptics from '@/lib/haptics'
import useLinkMenuActions from '@/hooks/useLinkMenuActions'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Switch from '@/components/ui/Switch'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { isSubmenu, menuGroups } from '@/components/ui/menuEntries'
import type {
  ContextMenuAction,
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu.types'
import type {
  GroupedListPickerRowProps,
  GroupedListProps,
  GroupedListRowProps,
  GroupedListSectionProps,
  GroupedListSwitchRowProps,
} from '@/components/ui/GroupedList.types'
import arrowDropDownIcon from '@/assets/compose-icons/arrow_drop_down.xml'
import checkIcon from '@/assets/icons/check.xml'
import chevronRightIcon from '@/assets/compose-icons/chevron_right.xml'
import openInNewIcon from '@/assets/compose-icons/open_in_new.xml'

type Position = 'only' | 'first' | 'middle' | 'last'

const RowPosition = createContext<Position>('only')

// Material 3's connected list: fully rounded at a group's ends, slightly
// rounded between its rows.
const OUTER_RADIUS = 20
const INNER_RADIUS = 4

const corners = (position: Position) => {
  const top =
    position === 'only' || position === 'first' ? OUTER_RADIUS : INNER_RADIUS
  const bottom =
    position === 'only' || position === 'last' ? OUTER_RADIUS : INNER_RADIUS
  return { topStart: top, topEnd: top, bottomStart: bottom, bottomEnd: bottom }
}

function useRowStyle() {
  const theme = useTheme()
  const fontSizeOffset = usePreferences((s) => s.fontSizeOffset)
  const size = (step: Parameters<typeof theme.fontSize>[0]) =>
    theme.fontSize(step) + fontSizeOffset

  return {
    theme,
    label: { fontFamily: theme.fonts.medium, fontSize: size('md') },
    sublabel: { fontFamily: theme.fonts.regular, fontSize: size('sm') },
    header: { fontFamily: theme.fonts.semiBold, fontSize: size('sm') },
    title: { fontFamily: theme.fonts.semiBold, fontSize: size('xl') },
    colors: {
      containerColor: theme.colors.backgroundLighter,
      contentColor: theme.colors.text,
      leadingContentColor: theme.colors.textAlt,
      trailingContentColor: theme.colors.textAlt,
      supportingContentColor: theme.colors.textAlt,
    },
  }
}

/**
 * A Material 3 grouped list (a `LazyColumn` that owns the scroll), in the app's
 * colors and fonts.
 */
export function GroupedList({ children, title, testID }: GroupedListProps) {
  const style = useRowStyle()
  const { theme } = style
  const colorScheme = usePreferences((s) => s.colorScheme)
  const insets = useSafeAreaInsets()

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
        <LazyColumn
          verticalArrangement={{ spacedBy: 24 }}
          contentPadding={{
            start: 16,
            end: 16,
            top: 16,
            bottom: 16 + insets.bottom,
          }}
          modifiers={testID ? [testTag(testID)] : undefined}
        >
          {title ? (
            <Text
              color={theme.colors.text}
              style={style.title}
              modifiers={[padding(16, 8, 16, 0)]}
            >
              {title}
            </Text>
          ) : null}
          {children}
        </LazyColumn>
      </Host>
    </View>
  )
}

/** Rows must be direct children, so the group can round its ends. */
export function GroupedListSection({
  title,
  footer,
  children,
}: GroupedListSectionProps) {
  const style = useRowStyle()
  const rows = Children.toArray(children).filter(isValidElement)
  const position = (index: number): Position =>
    rows.length === 1
      ? 'only'
      : index === 0
        ? 'first'
        : index === rows.length - 1
          ? 'last'
          : 'middle'

  return (
    <Column modifiers={[fillMaxWidth()]}>
      {title ? (
        <Text
          color={style.theme.colors.textAlt}
          style={style.header}
          modifiers={[padding(16, 0, 16, 8)]}
        >
          {title}
        </Text>
      ) : null}
      <Column
        verticalArrangement={{ spacedBy: 2 }}
        modifiers={[fillMaxWidth()]}
      >
        {rows.map((row, index) => (
          <RowPosition key={row.key ?? index} value={position(index)}>
            {row}
          </RowPosition>
        ))}
      </Column>
      {footer ? (
        <Text
          color={style.theme.colors.textAlt}
          style={style.sublabel}
          modifiers={[padding(16, 8, 16, 0)]}
        >
          {footer}
        </Text>
      ) : null}
    </Column>
  )
}

/** A Lucide icon hosted at its own size, so Compose doesn't stretch it. */
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
    <>
      <ListItem.HeadlineContent>
        <Text color={style.theme.colors.text} style={style.label}>
          {label}
        </Text>
      </ListItem.HeadlineContent>
      {sublabel ? (
        <ListItem.SupportingContent>
          <Text color={style.theme.colors.textAlt} style={style.sublabel}>
            {sublabel}
          </Text>
        </ListItem.SupportingContent>
      ) : null}
    </>
  )
}

function rowModifiers(position: Position, ...rest: ModifierConfig[]) {
  // Clip first so the ripple stays inside the row's shape.
  return [
    fillMaxWidth(),
    clip(Shapes.RoundedCorner(corners(position))),
    ...rest,
  ]
}

/**
 * A row that opens a screen, a website or an action. Long press opens its menu,
 * anchored to the row.
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
  checked,
  tint,
  testID,
}: GroupedListRowProps) {
  const style = useRowStyle()
  const { theme } = style
  const position = use(RowPosition)
  const [menuOpen, setMenuOpen] = useState(false)
  const [submenu, setSubmenu] = useState<ContextMenuSubmenu | null>(null)
  const linkActions = useLinkMenuActions({ url, label, onOpen: onPress })
  const groups = disabled
    ? []
    : menuGroups([...linkActions, ...(contextActions ?? [])])

  const press =
    onPress && !disabled
      ? () => {
          Haptics.light()
          onPress()
        }
      : undefined
  const openMenu = () => {
    void Haptics.androidLongPress()
    setSubmenu(null)
    setMenuOpen(true)
  }
  const closeMenu = () => {
    setMenuOpen(false)
    setSubmenu(null)
  }

  const interaction: ModifierConfig[] = groups.length
    ? [combinedClickable({ onClick: press, onLongClick: openMenu })]
    : press
      ? [
          selected
            ? selectable(true, press)
            : checked !== undefined
              ? // One of a list of choices: TalkBack says if it's the one.
                selectable(checked, press, 'radioButton')
              : clickable(press),
        ]
      : []

  const accessoryIcon =
    accessory === 'external'
      ? openInNewIcon
      : accessory === 'chevron'
        ? chevronRightIcon
        : null

  const item = (
    <ListItem
      colors={{
        ...style.colors,
        containerColor: selected
          ? theme.colors.accentTranslucent
          : (tint ?? style.colors.containerColor),
      }}
      modifiers={rowModifiers(
        position,
        ...interaction,
        ...(disabled ? [alpha(0.4)] : []),
        ...(testID ? [testTag(testID)] : [])
      )}
    >
      <RowText label={label} sublabel={sublabel} />
      {icon ? (
        <ListItem.LeadingContent>
          <RowIcon
            icon={icon}
            color={iconColor ?? theme.colors.textAlt}
            fill={iconFill}
          />
        </ListItem.LeadingContent>
      ) : null}
      {trailing || accessoryIcon ? (
        <ListItem.TrailingContent>
          <Row
            verticalAlignment='center'
            horizontalArrangement={{ spacedBy: 8 }}
          >
            {trailing ? (
              <RNHostView matchContents>
                <View pointerEvents='none'>{trailing}</View>
              </RNHostView>
            ) : null}
            {accessoryIcon ? (
              <Icon
                source={accessoryIcon}
                size={accessory === 'external' ? 18 : 22}
                tint={theme.colors.textAlt}
              />
            ) : null}
          </Row>
        </ListItem.TrailingContent>
      ) : null}
    </ListItem>
  )

  if (!groups.length) return item

  const menuItem = (
    key: string,
    title: string,
    onClick: () => void,
    destructive?: boolean
  ) => (
    <DropdownMenuItem
      key={key}
      elementColors={{
        textColor: destructive ? theme.colors.error : theme.colors.text,
      }}
      onClick={onClick}
    >
      <DropdownMenuItem.Text>
        <Text>{title}</Text>
      </DropdownMenuItem.Text>
    </DropdownMenuItem>
  )
  const choose = (action: ContextMenuAction) => {
    closeMenu()
    action.onPress()
  }

  return (
    <DropdownMenu
      expanded={menuOpen}
      onDismissRequest={closeMenu}
      color={theme.colors.card}
      modifiers={[fillMaxWidth()]}
    >
      <DropdownMenu.Trigger>{item}</DropdownMenu.Trigger>
      <DropdownMenu.Items>
        {submenu ? (
          <>
            {menuItem('back', `‹  ${submenu.title}`, () => setSubmenu(null))}
            <HorizontalDivider color={theme.colors.border} />
            {submenu.actions.map((action) =>
              menuItem(
                action.id,
                action.title,
                () => choose(action),
                action.destructive
              )
            )}
          </>
        ) : (
          groups.map((group, index) => (
            <Fragment key={index}>
              {index > 0 ? (
                <HorizontalDivider color={theme.colors.border} />
              ) : null}
              {group.map((entry) =>
                isSubmenu(entry)
                  ? menuItem(entry.id, `${entry.title}  ›`, () =>
                      setSubmenu(entry)
                    )
                  : menuItem(
                      entry.id,
                      entry.title,
                      () => choose(entry),
                      entry.destructive
                    )
              )}
            </Fragment>
          ))
        )}
      </DropdownMenu.Items>
    </DropdownMenu>
  )
}

/**
 * Only the switch toggles: an info button can't sit inside a row that toggles
 * without a tap on it doing both.
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
  const { theme } = style
  const position = use(RowPosition)

  return (
    <ListItem colors={style.colors} modifiers={rowModifiers(position)}>
      <ListItem.HeadlineContent>
        <Row verticalAlignment='center'>
          <Text color={theme.colors.text} style={style.label}>
            {label}
          </Text>
          {info ? (
            <RNHostView matchContents>
              {/* One native child: the popover mounts its own Modal beside the button. */}
              <View>
                <InfoPopover title={label} description={info} />
              </View>
            </RNHostView>
          ) : null}
        </Row>
      </ListItem.HeadlineContent>
      {icon ? (
        <ListItem.LeadingContent>
          <RowIcon icon={icon} color={theme.colors.textAlt} />
        </ListItem.LeadingContent>
      ) : null}
      <ListItem.TrailingContent>
        <RNHostView matchContents>
          <View>
            <Switch
              testID={testID}
              accessibilityLabel={label}
              value={value}
              onValueChange={onValueChange}
              disabled={disabled}
            />
          </View>
        </RNHostView>
      </ListItem.TrailingContent>
    </ListItem>
  )
}

/** Opens a menu of choices anchored to the row, which shows the current one. */
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
  const { theme } = style
  const position = use(RowPosition)
  const [expanded, setExpanded] = useState(false)
  const current = options.find((option) => option.value === value)

  return (
    <DropdownMenu
      expanded={expanded}
      onDismissRequest={() => setExpanded(false)}
      color={theme.colors.card}
      modifiers={[fillMaxWidth()]}
    >
      <DropdownMenu.Trigger>
        <ListItem
          colors={style.colors}
          modifiers={rowModifiers(
            position,
            clickable(() => setExpanded(true)),
            ...(testID ? [testTag(testID)] : [])
          )}
        >
          {/* The current choice goes under the label, as in Android's list
              settings, so a long one doesn't squeeze the label. */}
          <RowText
            label={label}
            sublabel={[current?.label, sublabel].filter(Boolean).join('\n')}
          />
          {icon ? (
            <ListItem.LeadingContent>
              <RowIcon icon={icon} color={theme.colors.textAlt} />
            </ListItem.LeadingContent>
          ) : null}
          <ListItem.TrailingContent>
            <Icon
              source={arrowDropDownIcon}
              size={22}
              tint={theme.colors.textAlt}
            />
          </ListItem.TrailingContent>
        </ListItem>
      </DropdownMenu.Trigger>
      <DropdownMenu.Items>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            elementColors={{ textColor: theme.colors.text }}
            onClick={() => {
              setExpanded(false)
              if (option.value !== value) onChange(option.value)
            }}
          >
            <DropdownMenuItem.Text>
              <Text>{option.label}</Text>
            </DropdownMenuItem.Text>
            {option.value === value ? (
              <DropdownMenuItem.TrailingIcon>
                <Icon source={checkIcon} size={20} tint={theme.colors.text} />
              </DropdownMenuItem.TrailingIcon>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  )
}
