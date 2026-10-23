import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import {
  addProgressCard,
  getEffectiveProgressCards,
  keepUnknownProgressCards,
  moveProgressCard,
  PROGRESS_CARD_PREFERENCE,
  removeProgressCard,
  resizeProgressCard,
  sameProgressCards,
  stepProgressCard,
  type ProgressCardCatalog,
  type ProgressCardLayoutItem,
  type ProgressCardSize,
} from '@/lib/progressCards'
import { usePreferences } from '@/stores/preferences'

/** A tab's cards as shown, and the edits to them. */
export type ProgressCardsModel<Id extends string> = {
  /** Every card in the layout, shown or not. */
  layout: ProgressCardLayoutItem<Id>[]
  /** The cards that make sense here now, in order. */
  shown: ProgressCardLayoutItem<Id>[]
  isAvailable: (id: Id) => boolean
  isCustomized: boolean
  add: (id: Id) => void
  /** Removes the card, with an Undo toast that puts the layout back. */
  remove: (id: Id) => void
  resize: (id: Id, size: ProgressCardSize) => void
  move: (id: Id, target: Id) => void
  /** Moves a card one place among `among` (the shown cards by default). */
  step: (id: Id, direction: -1 | 1, among?: Id[]) => void
  reset: () => void
}

/**
 * One Progress tab's cards, stored in the tab's own preference. A card that
 * doesn't make sense now (`isAvailable`) stays in the layout, out of sight, and
 * comes back where it was when it does again.
 */
export default function useProgressCardLayout<Id extends string>({
  catalog,
  defaults,
  isAvailable,
  title,
}: {
  catalog: ProgressCardCatalog<Id>
  /** The layout for the User's role until they change it. */
  defaults: ProgressCardLayoutItem<Id>[]
  isAvailable: (id: Id) => boolean
  /** A card's name, for the Undo toast. */
  title: (id: Id) => string
}): ProgressCardsModel<Id> {
  const key = PROGRESS_CARD_PREFERENCE[catalog.scope]
  const stored = usePreferences((s) => s[key])
  const layout = getEffectiveProgressCards(catalog, stored, defaults)
  const shown = layout.filter((item) => isAvailable(item.id))
  const shownIds = shown.map((item) => item.id)

  // Edits read the store, not this render: a drag moves a card several times
  // between renders. A layout edited back to the defaults is stored as `null`,
  // so it keeps following the User's role.
  const write = (value: unknown) =>
    usePreferences.getState().set({ [key]: value })
  const edit = (
    change: (
      layout: ProgressCardLayoutItem<Id>[]
    ) => ProgressCardLayoutItem<Id>[]
  ) => {
    const current = usePreferences.getState()[key]
    const next = keepUnknownProgressCards(
      catalog,
      current,
      change(getEffectiveProgressCards(catalog, current, defaults))
    )
    write(sameProgressCards(next, defaults) ? null : next)
  }

  return {
    layout,
    shown,
    isAvailable,
    isCustomized: Array.isArray(stored),
    add: (id) => edit((l) => addProgressCard(catalog, l, id)),
    remove: (id) => {
      const before = usePreferences.getState()[key]
      edit((l) => removeProgressCard(l, id))
      toast.undo({
        title: i18n.t('progressCards.removed', { card: title(id) }),
        onUndo: () => write(before),
      })
    },
    resize: (id, size) => edit((l) => resizeProgressCard(catalog, l, id, size)),
    move: (id, target) => edit((l) => moveProgressCard(l, id, target)),
    step: (id, direction, among = shownIds) =>
      edit((l) => stepProgressCard(l, among, id, direction)),
    reset: () => write(null),
  }
}
