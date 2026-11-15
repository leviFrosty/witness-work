import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  use,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { type ReactElement } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Host } from '@expo/ui'
import {
  Column,
  DropdownMenu,
  DropdownMenuItem,
  HorizontalDivider,
  Icon,
  IconButton,
  LazyColumn,
  ListItem,
  RNHostView,
  Row,
  Text,
  TextButton,
  TextField,
  type TextFieldRef,
  useNativeState,
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
import { reorderMenuActions } from '@/components/ui/reorderMenuActions'
import i18n from '@/lib/locales'
import type {
  ContextMenuAction,
  ContextMenuEntries,
  ContextMenuSubmenu,
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
import arrowDownwardIcon from '@/assets/compose-icons/arrow_downward.xml'
import arrowUpwardIcon from '@/assets/compose-icons/arrow_upward.xml'
import moreVertIcon from '@/assets/compose-icons/more_vert.xml'
import arrowDropDownIcon from '@/assets/compose-icons/arrow_drop_down.xml'
import checkIcon from '@/assets/icons/check.xml'
import chevronRightIcon from '@/assets/compose-icons/chevron_right.xml'
import openInNewIcon from '@/assets/compose-icons/open_in_new.xml'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

type Position = 'only' | 'first' | 'middle' | 'last'

const RowPosition = createContext<Position>('only')

type Reorder = { index: number; count: number; moveTo: (to: number) => void }

const ReorderRow = createContext<Reorder | null>(null)

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

export function GroupedList({
  children,
  title,
  header,
  banner,
  testID,
}: GroupedListProps) {
  const foldColumn = useFoldColumn(inputLayout.contentMaxWidth)
  const style = useRowStyle()
  const { theme } = style
  const colorScheme = usePreferences((s) => s.colorScheme)
  const insets = useSafeAreaInsets()

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
          {header ? (
            <Row modifiers={[fillMaxWidth()]} horizontalArrangement='center'>
              <RNHostView matchContents>
                <View>{header}</View>
              </RNHostView>
            </Row>
          ) : null}
          {banner ? (
            <RNHostView
              matchContents={{ vertical: true }}
              modifiers={[fillMaxWidth()]}
            >
              <View>{banner}</View>
            </RNHostView>
          ) : null}
          {children}
        </LazyColumn>
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
      {data.map((item, index) => (
        <ReorderRow
          key={keyExtractor(item)}
          value={{
            index,
            count: data.length,
            moveTo: (to) => onMove(index, to),
          }}
        >
          {children(item, index)}
        </ReorderRow>
      ))}
    </GroupedListSection>
  )
}

function ReorderButtons({ reorder }: { reorder: Reorder }) {
  const { theme } = useRowStyle()
  const { index, count, moveTo } = reorder
  const buttons = [
    {
      icon: arrowUpwardIcon,
      label: i18n.t('moveUp'),
      target: index > 0 ? index - 1 : null,
    },
    {
      icon: arrowDownwardIcon,
      label: i18n.t('moveDown'),
      target: index < count - 1 ? index + 1 : null,
    },
  ]

  return (
    <Row verticalAlignment='center'>
      {buttons.map(({ icon, label, target }) => (
        <IconButton
          key={label}
          enabled={target !== null}
          modifiers={target === null ? [alpha(0.3)] : undefined}
          onClick={() => {
            if (target === null) return
            Haptics.light()
            moveTo(target)
          }}
        >
          <Icon
            source={icon}
            size={22}
            contentDescription={label}
            tint={theme.colors.text}
          />
        </IconButton>
      ))}
    </Row>
  )
}

function LeadingContent({
  reorder,
  icon,
}: {
  reorder: Reorder | null
  icon: ReactElement | null
}) {
  if (!reorder && !icon) return null
  return (
    <ListItem.LeadingContent>
      <Row verticalAlignment='center' horizontalArrangement={{ spacedBy: 8 }}>
        {reorder ? <ReorderButtons reorder={reorder} /> : null}
        {icon}
      </Row>
    </ListItem.LeadingContent>
  )
}

function RowMenu({
  label,
  actions,
}: {
  label: string
  actions?: ContextMenuEntries
}) {
  const { theme } = useRowStyle()
  const [open, setOpen] = useState(false)
  const entries = menuGroups(actions ?? [])
    .flat()
    .filter((entry): entry is ContextMenuAction => !isSubmenu(entry))
  if (!entries.length) return null

  return (
    <DropdownMenu
      expanded={open}
      onDismissRequest={() => setOpen(false)}
      color={theme.colors.card}
    >
      <DropdownMenu.Trigger>
        <IconButton onClick={() => setOpen(true)}>
          <Icon
            source={moreVertIcon}
            size={22}
            contentDescription={label}
            tint={theme.colors.textAlt}
          />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Items>
        {entries.map((entry) => (
          <DropdownMenuItem
            key={entry.id}
            elementColors={{
              textColor: entry.destructive
                ? theme.colors.error
                : theme.colors.text,
            }}
            onClick={() => {
              setOpen(false)
              entry.onPress()
            }}
          >
            <DropdownMenuItem.Text>
              <Text>{entry.title}</Text>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
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
  return [
    fillMaxWidth(),
    clip(Shapes.RoundedCorner(corners(position))),
    ...rest,
  ]
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
  const position = use(RowPosition)
  const [menuOpen, setMenuOpen] = useState(false)
  const [submenu, setSubmenu] = useState<ContextMenuSubmenu | null>(null)
  const reorder = use(ReorderRow)
  const linkActions = useLinkMenuActions({ url, label, onOpen: onPress })
  const groups = disabled
    ? []
    : menuGroups([
        ...linkActions,
        ...(contextActions ?? []),
        reorder ? reorderMenuActions(reorder) : [],
      ])

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
              ? selectable(checked, press, 'radioButton')
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
      <LeadingContent
        reorder={reorder}
        icon={
          icon ? (
            <RowIcon
              icon={icon}
              color={iconColor ?? theme.colors.textAlt}
              fill={iconFill}
            />
          ) : null
        }
      />
      {trailing || accessoryIcon || (menuActions && !disabled) ? (
        <ListItem.TrailingContent>
          <Row
            verticalAlignment='center'
            horizontalArrangement={{ spacedBy: 8 }}
          >
            {disabled ? null : (
              <RowMenu label={menuLabel ?? label} actions={menuActions} />
            )}
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
  const reorder = use(ReorderRow)

  return (
    <ListItem colors={style.colors} modifiers={rowModifiers(position)}>
      <ListItem.HeadlineContent>
        <Row verticalAlignment='center'>
          <Text color={theme.colors.text} style={style.label}>
            {label}
          </Text>
          {info ? (
            <RNHostView matchContents>
              {}
              <View>
                <InfoPopover title={label} description={info} />
              </View>
            </RNHostView>
          ) : null}
        </Row>
      </ListItem.HeadlineContent>
      <LeadingContent
        reorder={reorder}
        icon={
          icon ? <RowIcon icon={icon} color={theme.colors.textAlt} /> : null
        }
      />
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
          {}
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

export function GroupedListTextFieldRow({
  value,
  onChangeText,
  onEndEditing,
  accessibilityLabel,
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
  const position = use(RowPosition)
  const reorder = use(ReorderRow)
  const text = useNativeState(value)
  const field = useRef<TextFieldRef>(null)
  const typed = useRef(value)
  useEffect(() => {
    if (value === typed.current) return
    typed.current = value
    text.set(value)
  }, [value, text])
  useImperativeHandle(ref, () => ({ focus: () => void field.current?.focus() }))
  const hasMenu = menuGroups(menuActions ?? []).length > 0
  const clear = 'transparent'

  return (
    <ListItem colors={style.colors} modifiers={rowModifiers(position)}>
      <ListItem.HeadlineContent>
        <TextField
          ref={field}
          value={text}
          singleLine
          maxLength={maxLength}
          isError={invalid}
          textStyle={{ ...style.label, color: theme.colors.text }}
          keyboardOptions={{
            capitalization: autoCapitalize,
            imeAction: 'done',
          }}
          keyboardActions={{
            onDone: () => {
              if (action) action.onPress()
              else void field.current?.blur()
            },
          }}
          onValueChange={(next) => {
            typed.current = next
            onChangeText(next)
          }}
          onFocusChanged={(focused) => {
            if (!focused) onEndEditing?.()
          }}
          colors={{
            focusedContainerColor: clear,
            unfocusedContainerColor: clear,
            errorContainerColor: clear,
            focusedIndicatorColor: theme.colors.accent,
            unfocusedIndicatorColor: theme.colors.border,
            cursorColor: theme.colors.accent,
          }}
          modifiers={[fillMaxWidth(), ...(testID ? [testTag(testID)] : [])]}
        >
          <TextField.Placeholder>
            <Text color={theme.colors.textAlt} style={style.label}>
              {placeholder ?? accessibilityLabel}
            </Text>
          </TextField.Placeholder>
        </TextField>
      </ListItem.HeadlineContent>
      {sublabel ? (
        <ListItem.SupportingContent>
          <Text color={theme.colors.textAlt} style={style.sublabel}>
            {sublabel}
          </Text>
        </ListItem.SupportingContent>
      ) : null}
      <LeadingContent reorder={reorder} icon={null} />
      {action || hasMenu ? (
        <ListItem.TrailingContent>
          <Row verticalAlignment='center'>
            {action ? (
              <TextButton
                onClick={() => {
                  Haptics.light()
                  action.onPress()
                }}
              >
                <Text color={theme.colors.accent} style={style.label}>
                  {action.label}
                </Text>
              </TextButton>
            ) : null}
            <RowMenu
              label={menuLabel ?? accessibilityLabel}
              actions={menuActions}
            />
          </Row>
        </ListItem.TrailingContent>
      ) : null}
    </ListItem>
  )
}
