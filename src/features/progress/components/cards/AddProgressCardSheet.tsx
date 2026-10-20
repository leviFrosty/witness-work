import AddItemsSheet from '@/components/ui/reorderable/AddItemsSheet'
import i18n from '@/lib/locales'
import type { ProgressCardMeta } from '@/features/progress/components/cards/progressCardRegistry'

type Props<Id extends string, Group extends string> = {
  open: boolean
  onClose: () => void
  /** Every card the tab has, in the sheet's order. */
  ids: readonly Id[]
  cards: Record<Id, ProgressCardMeta<Group>>
  groups: { group: Group; title: () => string }[]
  /** Cards on the screen now. */
  added: Id[]
  isAvailable: (id: Id) => boolean
  onAdd: (id: Id) => void
}

/**
 * Every card the User can put on a Progress tab, by what it covers. Cards
 * already there show a check; the rest add with one tap, at the top.
 */
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
