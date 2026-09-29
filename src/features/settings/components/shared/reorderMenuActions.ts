import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import i18n from '@/lib/locales'

type ReorderMenuOptions = {
  /** The row's position among the rows shown. */
  index: number
  count: number
  /** Moves the row to `target`, a position among the rows shown. */
  moveTo: (target: number) => void
  /** Current visibility, for a Show/Hide item. Omit for rows without one. */
  visible?: boolean
  setVisible?: (visible: boolean) => void
}

/**
 * Long-press menu for a reorderable Settings row, mirroring its arrow buttons
 * and switch: Move to Top / Up / Down / to Bottom, then Show or Hide. Moves
 * that wouldn't change anything are hidden, and "to Top/Bottom" only appear
 * when they differ from a single step.
 */
export function reorderMenuActions({
  index,
  count,
  moveTo,
  visible,
  setVisible,
}: ReorderMenuOptions): ContextMenuEntries {
  const last = count - 1
  return [
    [
      index > 1 && {
        id: 'move_to_top',
        title: i18n.t('moveToTop'),
        systemImage: 'arrow.up.to.line',
        onPress: () => moveTo(0),
      },
      index > 0 && {
        id: 'move_up',
        title: i18n.t('moveUp'),
        systemImage: 'arrow.up',
        onPress: () => moveTo(index - 1),
      },
      index < last && {
        id: 'move_down',
        title: i18n.t('moveDown'),
        systemImage: 'arrow.down',
        onPress: () => moveTo(index + 1),
      },
      index < last - 1 && {
        id: 'move_to_bottom',
        title: i18n.t('moveToBottom'),
        systemImage: 'arrow.down.to.line',
        onPress: () => moveTo(last),
      },
    ],
    [
      visible !== undefined &&
        setVisible && {
          id: visible ? 'hide' : 'show',
          title: i18n.t(visible ? 'hide' : 'show'),
          systemImage: visible ? 'eye.slash' : 'eye',
          onPress: () => setVisible(!visible),
        },
    ],
  ]
}

/** Returns `order` with the item at `from` moved to `to`. */
export function moveItem<T>(order: T[], from: number, to: number): T[] {
  const next = [...order]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
