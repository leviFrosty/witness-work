import { Fragment } from 'react'
import {
  Column,
  DropdownMenuItem,
  HorizontalDivider,
  Icon,
  Spacer,
  Text,
} from '@expo/ui/jetpack-compose'
import {
  selectable,
  selectableGroup,
  size,
} from '@expo/ui/jetpack-compose/modifiers'
import useTheme from '@/contexts/theme'
import androidMenuIcons from '@/components/ui/androidMenuIcons'
import { isSubmenu } from '@/components/ui/menuEntries'
import type {
  ContextMenuAction,
  ContextMenuItem,
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu.types'
import checkIcon from '@/assets/icons/check.xml'

type MenuItemsProps = {
  groups: ContextMenuItem[][]

  submenu: ContextMenuSubmenu | null
  onSubmenuChange: (submenu: ContextMenuSubmenu | null) => void

  onSelect: (action: ContextMenuAction) => void
}

export default function MenuItems({
  groups,
  submenu,
  onSubmenuChange,
  onSelect,
}: MenuItemsProps) {
  const theme = useTheme()
  const iconFor = (systemImage: ContextMenuItem['systemImage']) =>
    systemImage ? androidMenuIcons[systemImage] : undefined
  const shown = submenu ? submenu.actions : groups.flat()
  const indent = shown.some((entry) => iconFor(entry.systemImage))

  const item = (
    key: string,
    title: string,
    onClick: () => void,
    {
      systemImage,
      destructive,
      checked,
    }: Partial<
      Pick<ContextMenuAction, 'systemImage' | 'destructive' | 'checked'>
    > = {}
  ) => {
    const color = destructive ? theme.colors.error : theme.colors.text
    const icon = iconFor(systemImage)
    return (
      <DropdownMenuItem
        key={key}
        elementColors={{ textColor: color }}
        modifiers={
          checked === undefined
            ? undefined
            : [selectable(checked, onClick, 'radioButton')]
        }
        onClick={onClick}
      >
        <DropdownMenuItem.Text>
          <Text>{title}</Text>
        </DropdownMenuItem.Text>
        {icon || indent ? (
          <DropdownMenuItem.LeadingIcon>
            {icon ? (
              <Icon source={icon} size={24} tint={color} />
            ) : (
              <Spacer modifiers={[size(24, 24)]} />
            )}
          </DropdownMenuItem.LeadingIcon>
        ) : null}
        {checked ? (
          <DropdownMenuItem.TrailingIcon>
            <Icon source={checkIcon} size={20} tint={theme.colors.text} />
          </DropdownMenuItem.TrailingIcon>
        ) : null}
      </DropdownMenuItem>
    )
  }

  const action = (entry: ContextMenuAction) =>
    item(entry.id, entry.title, () => onSelect(entry), entry)

  const group = (items: ContextMenuItem[]) => {
    const rendered = items.map((entry) =>
      isSubmenu(entry)
        ? item(entry.id, `${entry.title}  ›`, () => onSubmenuChange(entry), {
            systemImage: entry.systemImage,
          })
        : action(entry)
    )
    const radios = items.some(
      (entry) => !isSubmenu(entry) && entry.checked !== undefined
    )
    return radios ? (
      <Column modifiers={[selectableGroup()]}>{rendered}</Column>
    ) : (
      rendered
    )
  }

  if (submenu) {
    return (
      <>
        {item('back', `‹  ${submenu.title}`, () => onSubmenuChange(null))}
        <HorizontalDivider color={theme.colors.border} />
        {group(submenu.actions)}
      </>
    )
  }

  return groups.map((entries, index) => (
    <Fragment key={index}>
      {index > 0 ? <HorizontalDivider color={theme.colors.border} /> : null}
      {group(entries)}
    </Fragment>
  ))
}
