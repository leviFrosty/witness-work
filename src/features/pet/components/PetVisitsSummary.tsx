import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { PetVisit } from '@/types/pet'
import type { RootStackNavigation } from '@/types/rootStack'
import type { GamePalette } from '@/features/pet/art/gameUi'
import { GameIcon } from '@/features/pet/components/GameControls'
import { GameFrame } from '@/features/pet/components/GamePixels'
import PetSpriteTile from '@/features/pet/render/PetSpriteTile'

/** Sprites shown stacked in the row; the count says the rest. */
const STACKED = 4
const TILE = 32

/**
 * The pet's details: one row for buddies' pets visiting today, however many,
 * the first few stacked, with how many and whose. It opens the full list
 * (`PetVisits`). Nothing without visitors.
 */
export default function PetVisitsSummary({
  visits,
  palette,
}: {
  visits: readonly PetVisit[]
  palette: GamePalette
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  if (visits.length === 0) return null
  const [first] = visits
  const summary = i18n.t('pet.visitor.summary' as TranslationKey, {
    count: visits.length,
  })
  const withWhom =
    visits.length === 1
      ? i18n.t('pet.visitor.withOne', { name: first.buddyName })
      : i18n.t('pet.visitor.withMore' as TranslationKey, {
          name: first.buddyName,
          count: visits.length - 1,
        })

  return (
    <Button
      onPress={() => navigation.navigate('PetVisits')}
      accessibilityRole='button'
      accessibilityLabel={`${summary}. ${withWhom}`}
      pointerEffect='tint'
    >
      <GameFrame
        kind='panel'
        palette={palette}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: 56,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          {visits.slice(0, STACKED).map((visit, i) => (
            <View
              key={visit.inboxId}
              style={{ marginStart: i === 0 ? 0 : -TILE / 2, zIndex: -i }}
            >
              <PetSpriteTile
                species={visit.pet.species}
                coat={visit.pet.coat}
                size={TILE}
                seed={i * 131}
              />
            </View>
          ))}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: theme.fonts.semiBold, color: palette.ink }}
          >
            {summary}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: theme.fontSize('sm'), color: palette.inkAlt }}
          >
            {withWhom}
          </Text>
        </View>
        <GameIcon name='forward' color={palette.inkAlt} />
      </GameFrame>
    </Button>
  )
}
