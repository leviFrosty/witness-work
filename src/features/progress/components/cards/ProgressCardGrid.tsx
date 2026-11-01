import { type ReactNode, useState } from 'react'
import { Plus as PlusIcon } from 'lucide-react-native'
import { useWindowDimensions, View } from 'react-native'
import Button from '@/components/ui/Button'
import EditLayoutButton from '@/components/ui/EditLayoutButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import ReorderableGrid from '@/components/ui/reorderable/ReorderableGrid'
import type { ReorderScroller } from '@/components/ui/reorderable/useReorderScroller'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import {
  spansBothColumns,
  type ProgressCardLayoutItem,
  type ProgressCardSize,
} from '@/lib/progressCards'
import type { ProgressCardsModel } from '@/features/progress/hooks/useProgressCardLayout'
import type {
  ProgressCardDestination,
  ProgressCardMeta,
} from '@/features/progress/components/cards/progressCardRegistry'
import { progressCardSizeLabel } from '@/features/progress/components/cards/progressCardSizes'
import ProgressCardPressable from '@/features/progress/components/cards/ProgressCardPressable'
import AddProgressCardSheet from '@/features/progress/components/cards/AddProgressCardSheet'

const SIZE_ORDER: ProgressCardSize[] = ['small', 'compact', 'wide', 'full']

export const PROGRESS_CARD_GAP = 12

const TWO_COLUMN_MIN_WIDTH = 340

export type ProgressCardEditStart = 'card' | 'add' | 'footer'

type CardMeta<Group extends string> = ProgressCardMeta<Group> & {
  destination?: ProgressCardDestination
}

type Props<Id extends string, Group extends string> = {
  cards: ProgressCardsModel<Id>

  ids: readonly Id[]
  sizes: Record<Id, readonly ProgressCardSize[]>
  meta: Record<Id, CardMeta<Group>>
  groups: { group: Group; title: () => string }[]

  renderContent: (item: ProgressCardLayoutItem<Id>) => ReactNode

  renderOwn?: (item: ProgressCardLayoutItem<Id>) => ReactNode | undefined

  liftsByZone?: (id: Id) => boolean

  sizeHeight?: (id: Id, size: ProgressCardSize) => number | undefined
  editing: boolean
  onStartEditing: (source: ProgressCardEditStart) => void

  onFinishEditing: () => void

  adding: boolean
  onAddingChange: (adding: boolean) => void
  onNavigate: (destination: ProgressCardDestination) => void
  scroller: ReorderScroller
  onDragChange: (dragging: boolean) => void

  exclude?: Id[]
}

export default function ProgressCardGrid<
  Id extends string,
  Group extends string,
>({
  cards,
  ids,
  sizes: cardSizes,
  meta,
  groups,
  renderContent,
  renderOwn,
  liftsByZone,
  sizeHeight,
  editing,
  onStartEditing,
  onFinishEditing,
  adding,
  onAddingChange,
  onNavigate,
  scroller,
  onDragChange,
  exclude = [],
}: Props<Id, Group>) {
  const theme = useTheme()
  const { fontScale } = useWindowDimensions()
  const largeText = useAccessibilityTextSize()

  const [layoutGeneration, setLayoutGeneration] = useState(0)
  const [wasEditing, setWasEditing] = useState(editing)
  if (wasEditing !== editing) {
    setWasEditing(editing)
    if (!editing) setLayoutGeneration(layoutGeneration + 1)
  }
  const items = cards.shown.filter((item) => !exclude.includes(item.id))

  const renderCard = (item: ProgressCardLayoutItem<Id>) => {
    const own = renderOwn?.(item)
    if (own !== undefined) return own
    const content = renderContent(item)
    if (editing) return content
    const destination = meta[item.id].destination
    return (
      <ProgressCardPressable
        onEdit={() => onStartEditing('card')}
        onPress={destination ? () => onNavigate(destination) : undefined}
      >
        <>{content}</>
      </ProgressCardPressable>
    )
  }

  const shownIds = items.map((item) => item.id)

  return (
    <View style={{ gap: 12 }}>
      {editing ? (
        <Text
          style={{
            textAlign: 'center',
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('progressCards.editHint')}
        </Text>
      ) : null}

      {!items.length ? (
        <Button
          onPress={() => {
            if (!editing) onStartEditing('add')
            onAddingChange(true)
          }}
          accessibilityLabel={i18n.t('progressCards.addCards')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 16,
            borderRadius: theme.numbers.borderRadiusLg,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: theme.colors.accent,
            backgroundColor: theme.colors.accentTranslucent,
          }}
          noTransform
        >
          <LucideIcon icon={PlusIcon} size={16} color={theme.colors.accent} />
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.accent,
            }}
          >
            {i18n.t('progressCards.addCards')}
          </Text>
        </Button>
      ) : null}

      {items.length ? (
        <ReorderableGrid
          layoutKey={`${layoutGeneration}`}
          items={items}
          editing={editing}
          span={(size) => (spansBothColumns(size) ? 2 : 1)}
          minWidth={TWO_COLUMN_MIN_WIDTH * (largeText ? fontScale : 1)}
          gap={PROGRESS_CARD_GAP}
          renderItem={renderCard}
          itemProps={(item) => {
            const title = meta[item.id].title()
            const at = shownIds.indexOf(item.id)
            const sizes = cardSizes[item.id]
            return {
              liftOutsideEditing: liftsByZone?.(item.id) ? 'zone' : true,
              removeLabel: i18n.t('progressCards.removeA11y', { card: title }),
              onRemove: () => cards.remove(item.id),
              resize:
                sizes.length > 1
                  ? {
                      label: i18n.t('progressCards.resizeA11y', {
                        card: title,
                      }),

                      options: [...sizes]
                        .sort(
                          (a, b) =>
                            SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b)
                        )
                        .map((size) => ({
                          size,
                          height: sizeHeight?.(item.id, size),
                        })),
                      onResize: (size) => cards.resize(item.id, size),
                    }
                  : undefined,
              accessibilityLabel: `${title}, ${progressCardSizeLabel(item.size)}`,
              accessibilityActions: [
                ...(at > 0
                  ? [{ name: 'earlier', label: i18n.t('moveUp') }]
                  : []),
                ...(at < shownIds.length - 1
                  ? [{ name: 'later', label: i18n.t('moveDown') }]
                  : []),
                ...sizes
                  .filter((size) => size !== item.size)
                  .map((size) => ({
                    name: `size:${size}`,
                    label: progressCardSizeLabel(size),
                  })),
                { name: 'remove', label: i18n.t('progressCards.removeCard') },
              ],
              onAccessibilityAction: (name) => {
                if (name === 'earlier') cards.step(item.id, -1, shownIds)
                else if (name === 'later') cards.step(item.id, 1, shownIds)
                else if (name === 'remove') cards.remove(item.id)
                else if (name.startsWith('size:'))
                  cards.resize(item.id, name.slice(5) as ProgressCardSize)
              },
            }
          }}
          onMove={cards.move}
          onLiftToEdit={() => onStartEditing('card')}
          onBackgroundPress={onFinishEditing}
          onDragChange={onDragChange}
          scroller={scroller}
        />
      ) : null}

      {!editing && items.length ? (
        <View style={{ paddingTop: 12 }}>
          <EditLayoutButton
            label={i18n.t('progressCards.editCards')}
            onPress={() => onStartEditing('footer')}
            testID='progress-edit-cards'
          />
        </View>
      ) : null}

      {editing && cards.isCustomized ? (
        <Button
          onPress={() =>
            confirmDestructive({
              title: i18n.t('progressCards.resetTitle'),
              description: i18n.t('progressCards.resetDescription'),
              confirmLabel: i18n.t('progressCards.reset'),
              onConfirm: cards.reset,
            })
          }
          style={{
            alignSelf: 'center',
            paddingVertical: 8,
            paddingHorizontal: 12,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('progressCards.reset')}
          </Text>
        </Button>
      ) : null}

      <AddProgressCardSheet
        open={adding}
        onClose={() => onAddingChange(false)}
        ids={ids}
        cards={meta}
        groups={groups}
        added={cards.layout.map((item) => item.id)}
        isAvailable={cards.isAvailable}
        onAdd={cards.add}
      />
    </View>
  )
}
