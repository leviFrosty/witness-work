import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import i18n from '@/lib/locales'

type ReorderMenuOptions = {
  index: number
  count: number

  moveTo: (target: number) => void

  visible?: boolean
  setVisible?: (visible: boolean) => void
}

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

export function moveItem<T>(order: T[], from: number, to: number): T[] {
  const next = [...order]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
