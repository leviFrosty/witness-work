import { useEffect, type ReactNode } from 'react'
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import i18n from '@/lib/locales'
import { cssColor, type GamePalette } from '@/features/pet/art/gameUi'
import {
  GameIconButton,
  GamePlaque,
} from '@/features/pet/components/GameControls'
import { GamePaper } from '@/features/pet/components/GamePixels'
import useGamePalette from '@/features/pet/hooks/useGamePalette'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'

const CORNER_PULL = 4

export function useGameSheetBackground(palette: GamePalette) {
  const navigation = useNavigation()
  const paper = cssColor(palette.paper)
  useEffect(() => {
    navigation.setOptions({ contentStyle: { backgroundColor: paper } })
  }, [navigation, paper])
}

export function GameSheetHeader({
  title,
  palette,
  onBack,
}: {
  title: string
  palette: GamePalette
  onBack?: () => void
}) {
  const navigation = useNavigation()
  const close = Platform.OS === 'android' && !onBack
  const side = MIN_TOUCH_TARGET - CORNER_PULL
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: MIN_TOUCH_TARGET,
      }}
    >
      <View style={{ width: side, marginStart: -CORNER_PULL }}>
        {onBack && (
          <GameIconButton
            icon='back'
            label={i18n.t('pet.shop.back')}
            palette={palette}
            onPress={onBack}
          />
        )}
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <GamePlaque title={title} palette={palette} />
      </View>
      <View style={{ width: side, marginEnd: -CORNER_PULL }}>
        {close && (
          <GameIconButton
            icon='close'
            label={i18n.t('close')}
            palette={palette}
            onPress={() => navigation.goBack()}
          />
        )}
      </View>
    </View>
  )
}

export default function GameSheet({
  title,
  onBack,
  style,
  children,
}: {
  title?: string
  onBack?: () => void
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const palette = useGamePalette()
  const sheetInsets = usePetSheetInsets()
  useGameSheetBackground(palette)
  return (
    <GamePaper
      palette={palette}
      style={[
        {
          paddingHorizontal: 20,
          paddingTop: sheetInsets.top - 8,
          paddingBottom: sheetInsets.bottom,
          gap: 18,

          flex: Platform.OS === 'android' ? 1 : undefined,
        },
        style,
      ]}
    >
      {title !== undefined && (
        <GameSheetHeader title={title} palette={palette} onBack={onBack} />
      )}
      {children}
    </GamePaper>
  )
}
