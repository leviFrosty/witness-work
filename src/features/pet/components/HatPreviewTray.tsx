import type { RefObject } from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { GamePalette } from '@/features/pet/art/gameUi'
import GameColorTray from '@/features/pet/components/GameColorTray'
import { GameButton } from '@/features/pet/components/GameControls'
import { hatReactions } from '@/features/pet/lib/hatReactions'
import { hatNoteOf } from '@/features/pet/lib/roomLabels'
import { itemRarity } from '@/features/pet/lib/prices'
import type { PetSceneHandle } from '@/features/pet/render/PetSceneView'

export default function HatPreviewTray({
  hat,
  hatName,
  petName,
  scene,
  from,
  column,
  cardWidth,
  cardGap,
  gap,
  palette,
}: {
  hat: string
  hatName: string
  petName: string
  scene: RefObject<PetSceneHandle | null>
  from: 'shop' | 'room'
  column: number
  cardWidth: number
  cardGap: number
  gap: number
  palette: GamePalette
}) {
  const theme = useTheme()
  const item = `hat:${hat}`
  const reactions = hatReactions(item)
  const note = hatNoteOf(hat)
  const played = (trigger: 'pat' | 'coins') =>
    analytics.capture('pet_hat_preview_played', { hat, trigger, from })
  return (
    <GameColorTray
      rarity={itemRarity(item)}
      quiet
      column={column}
      cardWidth={cardWidth}
      cardGap={cardGap}
      gap={gap}
      palette={palette}
    >
      <Text
        accessibilityRole='header'
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: palette.inkAlt,
        }}
      >
        {i18n.t('pet.shop.hatPreview.title')}
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
            label={i18n.t('pet.shop.hatPreview.pat')}
            accessibilityLabel={i18n.t('pet.shop.hatPreview.patA11y', {
              item: hatName,
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
            label={i18n.t('pet.shop.hatPreview.coins')}
            accessibilityLabel={i18n.t('pet.shop.hatPreview.coinsA11y', {
              item: hatName,
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
    </GameColorTray>
  )
}
