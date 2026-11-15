import type { RefObject } from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { GamePalette } from '@/features/pet/art/gameUi'
import GameColorTray from '@/features/pet/components/GameColorTray'
import { GameButton } from '@/features/pet/components/GameControls'
import { itemReactions } from '@/features/pet/lib/itemReactions'
import { itemNoteOf } from '@/features/pet/lib/roomLabels'
import { itemRarity } from '@/features/pet/lib/prices'
import type { RoomChoicePart } from '@/features/pet/lib/roomOptions'
import type { PetSceneHandle } from '@/features/pet/render/PetSceneView'

type ReactionPreviewProps = {
  part: RoomChoicePart
  option: string
  itemName: string
  petName: string
  scene: RefObject<PetSceneHandle | null>
  from: 'shop' | 'room'
  palette: GamePalette
}

export function ReactionPreviewContent({
  part,
  option,
  itemName,
  petName,
  scene,
  from,
  palette,
}: ReactionPreviewProps) {
  const theme = useTheme()
  const item = `${part}:${option}`
  const reactions = itemReactions(item)
  const note = itemNoteOf(part, option)
  const grows = item === 'hat:fig'
  const played = (trigger: 'pat' | 'coins' | 'grow') =>
    analytics.capture('pet_item_preview_played', { item, part, trigger, from })
  return (
    <>
      <Text
        accessibilityRole='header'
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: palette.inkAlt,
        }}
      >
        {i18n.t('pet.shop.reactionPreview.title')}
      </Text>
      {note && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: palette.inkAlt,
          }}
        >
          {note}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4 }}>
        {reactions.includes('pat') && (
          <GameButton
            kind='soft'
            label={i18n.t('pet.shop.reactionPreview.pat')}
            accessibilityLabel={i18n.t('pet.shop.reactionPreview.patA11y', {
              item: itemName,
              name: petName,
            })}
            palette={palette}
            style={{ flex: 1 }}
            onPress={() => {
              scene.current?.hatPat()
              played('pat')
            }}
          />
        )}
        {reactions.includes('coins') && (
          <GameButton
            kind='soft'
            coin
            label={i18n.t('pet.shop.reactionPreview.coins')}
            accessibilityLabel={i18n.t('pet.shop.reactionPreview.coinsA11y', {
              item: itemName,
            })}
            palette={palette}
            style={{ flex: 1 }}
            onPress={() => {
              scene.current?.hatCoins()
              played('coins')
            }}
          />
        )}
      </View>
      {grows && (
        <GameButton
          kind='rare'
          icon='sprout'
          label={i18n.t('pet.shop.reactionPreview.grow')}
          accessibilityLabel={i18n.t('pet.shop.reactionPreview.growA11y', {
            item: itemName,
          })}
          palette={palette}
          style={{ marginTop: 4 }}
          onPress={() => {
            scene.current?.hatGrow()
            played('grow')
          }}
        />
      )}
    </>
  )
}

export default function ReactionPreviewTray({
  column,
  cardWidth,
  cardGap,
  gap,
  ...props
}: ReactionPreviewProps & {
  column: number | null
  cardWidth: number
  cardGap: number
  gap: number
}) {
  return (
    <GameColorTray
      rarity={itemRarity(`${props.part}:${props.option}`)}
      quiet
      column={column}
      cardWidth={cardWidth}
      cardGap={cardGap}
      gap={gap}
      palette={props.palette}
    >
      <ReactionPreviewContent {...props} />
    </GameColorTray>
  )
}
