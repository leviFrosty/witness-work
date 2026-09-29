import { MenuView, type MenuAction } from '@react-native-menu/menu'
import { Ellipsis as EllipsisIcon } from 'lucide-react-native'
import type { ReactElement } from 'react'
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native'

import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import {
  flattenMenu,
  isSubmenu,
  menuGroups,
  runMenuAction,
} from '@/components/ui/menuEntries'
import type {
  ContextMenuEntries,
  ContextMenuItem,
} from '@/components/ui/ContextMenu.types'
import { usePreferences } from '@/stores/preferences'

type PullDownMenuProps = {
  /** Same entries as `ContextMenu`: falsy items hidden, arrays are groups. */
  actions: ContextMenuEntries
  /** Sent with every chosen action as `context_menu_action`. */
  analyticsSurface: string
  /** Announced on the trigger. */
  accessibilityLabel: string
  /** Custom trigger. Defaults to a plain ellipsis "More" button. */
  children?: ReactElement
  /** Default trigger's icon size. */
  triggerSize?: number
  /** Default trigger's icon color. Defaults to `theme.colors.textAlt`. */
  triggerColor?: string
  style?: StyleProp<ViewStyle>
}

/**
 * Maps menu groups to `MenuView` actions.
 *
 * Two quirks of @react-native-menu/menu 2.0.0 on iOS (new architecture) shape
 * this:
 *
 * - Actions nest only one level: the Fabric bridge copies a top-level action's
 *   `subactions` but drops theirs. Groups are drawn as inline (`displayInline`)
 *   menus, so a submenu inside one would lose its items. A group holding a
 *   submenu is therefore laid out at the top level instead — UIKit still
 *   separates it from the inline groups around it.
 * - Every action reaches UIKit with an `imageColor`, defaulting to 0 (clear),
 *   which tints the SF Symbol invisible. Always pass a real color.
 *
 * Android's popup menu has no separators, so its groups are concatenated;
 * submenus open as nested popups. Its items stay text-only.
 */
export function nativeMenuActions(
  groups: ContextMenuItem[][],
  {
    ios,
    color,
    destructiveColor,
  }: { ios: boolean; color: string; destructiveColor: string }
): MenuAction[] {
  const icon = (
    systemImage: ContextMenuItem['systemImage'],
    destructive?: boolean
  ) =>
    ios && systemImage
      ? {
          image: systemImage,
          imageColor: destructive ? destructiveColor : color,
        }
      : {}

  const item = (entry: ContextMenuItem): MenuAction =>
    isSubmenu(entry)
      ? {
          id: entry.id,
          title: entry.title,
          ...icon(entry.systemImage),
          subactions: entry.actions.map((action) => ({
            id: `${entry.id}.${action.id}`,
            title: action.title,
            ...icon(action.systemImage, action.destructive),
            titleColor: action.destructive ? destructiveColor : undefined,
            attributes: action.destructive ? { destructive: true } : undefined,
          })),
        }
      : {
          id: entry.id,
          title: entry.title,
          ...icon(entry.systemImage, entry.destructive),
          titleColor: entry.destructive ? destructiveColor : undefined,
          attributes: entry.destructive ? { destructive: true } : undefined,
        }

  const native = groups.map((group) => group.map(item))
  if (!ios || groups.length < 2) return native.flat()

  return native.flatMap((group, index) =>
    groups[index].some(isSubmenu)
      ? group
      : [
          {
            id: `group-${index}`,
            title: '',
            displayInline: true,
            subactions: group,
          },
        ]
  )
}

/**
 * A native menu that opens on tap — the UIMenu pull-down on iOS, a popup menu
 * on Android. Use it for a visible "More" button in headers, and for rows whose
 * content can't host a long-press `ContextMenu` (e.g. rows with text inputs).
 * Everything else should put secondary actions in a `ContextMenu`.
 */
const PullDownMenu = ({
  actions,
  analyticsSurface,
  accessibilityLabel,
  children,
  triggerSize = 20,
  triggerColor,
  style,
}: PullDownMenuProps) => {
  const theme = useTheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const groups = menuGroups(actions)
  if (!groups.length) return null

  const leaves = flattenMenu(groups)
  const menuActions = nativeMenuActions(groups, {
    ios: Platform.OS === 'ios',
    color: theme.colors.text,
    destructiveColor: theme.colors.error,
  })

  return (
    <MenuView
      style={style}
      actions={menuActions}
      themeVariant={colorScheme ?? undefined}
      onPressAction={({ nativeEvent }) => {
        const chosen = leaves.find(({ key }) => key === nativeEvent.event)
        if (chosen)
          runMenuAction(chosen.action, chosen.key, analyticsSurface, 'tap')
      }}
    >
      <View
        accessible
        accessibilityRole='button'
        accessibilityLabel={accessibilityLabel}
        hitSlop={10}
        collapsable={false}
      >
        {children ?? (
          <LucideIcon
            icon={EllipsisIcon}
            color={triggerColor ?? theme.colors.textAlt}
            size={triggerSize}
          />
        )}
      </View>
    </MenuView>
  )
}

export default PullDownMenu
