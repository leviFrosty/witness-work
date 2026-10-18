import AddItemsSheet from '@/components/ui/reorderable/AddItemsSheet'
import i18n from '@/lib/locales'
import { PROGRESS_CARD_IDS, type ProgressCardId } from '@/lib/progressCards'
import {
  PROGRESS_CARDS,
  type ProgressCardGroup,
} from '@/features/progress/components/cards/progressCardRegistry'

const GROUPS: { group: ProgressCardGroup; title: () => string }[] = [
  { group: 'month', title: () => i18n.t('progressCards.group.month') },
  {
    group: 'serviceYear',
    title: () => i18n.t('progressCards.group.serviceYear'),
  },
  { group: 'more', title: () => i18n.t('progressCards.group.more') },
]

type Props = {
  open: boolean
  onClose: () => void
  /** Cards on the screen now. */
  added: ProgressCardId[]
  isAvailable: (id: ProgressCardId) => boolean
  onAdd: (id: ProgressCardId) => void
}

/**
 * Every card the User can put on Progress, by what it covers. Cards already
 * there show a check; the rest add with one tap, at the top.
 */
export default function AddProgressCardSheet({
  open,
  onClose,
  added,
  isAvailable,
  onAdd,
}: Props) {
  return (
    <AddItemsSheet
      open={open}
      onClose={onClose}
      title={i18n.t('progressCards.addCards')}
      addedHint={i18n.t('progressCards.added')}
      testID='add-progress-card-sheet'
      onAdd={onAdd}
      groups={GROUPS.map(({ group, title }) => ({
        key: group,
        title: title(),
        items: PROGRESS_CARD_IDS.filter(
          (id) => PROGRESS_CARDS[id].group === group && isAvailable(id)
        ).map((id) => ({
          id,
          icon: PROGRESS_CARDS[id].icon,
          title: PROGRESS_CARDS[id].title(),
          description: PROGRESS_CARDS[id].description(),
          added: added.includes(id),
        })),
      }))}
    />
  )
}
