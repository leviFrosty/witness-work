import type { AccessibilityActionEvent } from 'react-native'
import { analytics } from '@/lib/analytics'
import type {
  ContextMenuAction,
  ContextMenuEntries,
  ContextMenuItem,
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu.types'

export const isSubmenu = (item: ContextMenuItem): item is ContextMenuSubmenu =>
  'actions' in item

/**
 * Resolves menu entries into non-empty groups: drops hidden (falsy) items,
 * empty submenus, and empty groups. Consecutive loose items share a group.
 */
export function menuGroups(entries: ContextMenuEntries): ContextMenuItem[][] {
  const groups: ContextMenuItem[][] = []
  let loose: ContextMenuItem[] = []
  const keep = (item: ContextMenuItem | false | null | undefined) =>
    !!item && (!isSubmenu(item) || item.actions.length > 0)

  for (const entry of entries) {
    if (Array.isArray(entry)) {
      if (loose.length) groups.push(loose)
      loose = []
      const group = entry.filter(keep) as ContextMenuItem[]
      if (group.length) groups.push(group)
    } else if (keep(entry)) {
      loose.push(entry as ContextMenuItem)
    }
  }
  if (loose.length) groups.push(loose)
  return groups
}

export type ChosenAction = {
  action: ContextMenuAction
  /** VoiceOver/TalkBack label, prefixed with its submenu's title. */
  label: string
  /** Action id, prefixed with its submenu's id. */
  key: string
}

/** Every leaf action in menu order, for screen-reader custom actions. */
export function flattenMenu(groups: ContextMenuItem[][]): ChosenAction[] {
  return groups.flat().flatMap((item) =>
    isSubmenu(item)
      ? item.actions.map((action) => ({
          action,
          label: `${item.title}: ${action.title}`,
          key: `${item.id}.${action.id}`,
        }))
      : [{ action: item, label: item.title, key: item.id }]
  )
}

/** Runs a chosen action and records it. */
export function runMenuAction(
  action: ContextMenuAction,
  key: string,
  surface: string,
  trigger: 'long_press' | 'tap' | 'accessibility'
) {
  analytics.capture('context_menu_action', {
    surface,
    action: key,
    trigger,
  })
  action.onPress()
}

/**
 * Screen-reader custom actions mirroring the menu, so VoiceOver's Actions rotor
 * and TalkBack's actions menu reach every item without the gesture.
 */
export function menuAccessibilityProps(
  groups: ContextMenuItem[][],
  surface: string
) {
  const leaves = flattenMenu(groups)
  if (!leaves.length) return {}
  return {
    accessibilityActions: leaves.map(({ key, label }) => ({
      name: key,
      label,
    })),
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      const chosen = leaves.find(
        ({ key }) => key === event.nativeEvent.actionName
      )
      if (chosen)
        runMenuAction(chosen.action, chosen.key, surface, 'accessibility')
    },
  }
}
