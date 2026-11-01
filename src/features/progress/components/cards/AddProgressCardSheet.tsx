import AddItemsSheet from '@/components/ui/reorderable/AddItemsSheet'
import i18n from '@/lib/locales'
import type { ProgressCardMeta } from '@/features/progress/components/cards/progressCardRegistry'

type Props<Id extends string, Group extends string> = {
  open: boolean
  onClose: () => void

  ids: readonly Id[]
  cards: Record<Id, ProgressCardMeta<Group>>
  groups: { group: Group; title: () => string }[]

  added: Id[]
  isAvailable: (id: Id) => boolean
  onAdd: (id: Id) => void
}

export default function AddProgressCardSheet<
  Id extends string,
  Group extends string,
>({
  open,
  onClose,
  ids,
  cards,
  groups,
  added,
  isAvailable,
  onAdd,
}: Props<Id, Group>) {
  return (
    <AddItemsSheet
      open={open}
      onClose={onClose}
      title={i18n.t('progressCards.addCards')}
      addedHint={i18n.t('progressCards.added')}
      testID='add-progress-card-sheet'
      onAdd={onAdd}
      groups={groups.map(({ group, title }) => ({
        key: group,
        title: title(),
        items: ids
          .filter((id) => cards[id].group === group && isAvailable(id))
          .map((id) => ({
            id,
            icon: cards[id].icon,
            title: cards[id].title(),
            description: cards[id].description(),
            added: added.includes(id),
          })),
      }))}
    />
  )
}
