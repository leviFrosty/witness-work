import type { ContextMenuEntries } from '@/components/ui/ContextMenu.types'
import i18n from '@/lib/locales'

export function reorderMenuActions({
  index,
  count,
  moveTo,
}: {
  index: number
  count: number
  moveTo: (target: number) => void
}): Extract<ContextMenuEntries[number], unknown[]> {
  const last = count - 1
  return [
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
  ]
}
