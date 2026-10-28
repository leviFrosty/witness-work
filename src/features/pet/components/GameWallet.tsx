import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import Popover from '@/components/ui/Popover'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { cssColor, type GamePalette } from '@/features/pet/art/gameUi'
import { GameFrame, gamePixelScale } from '@/features/pet/components/GamePixels'
import PetWalletCounts from '@/features/pet/components/PetWalletCounts'
import type { GainPulse } from '@/features/pet/hooks/usePetReveal'
import { coinsText, currencyInfoText } from '@/features/pet/lib/roomLabels'

const INFO_WIDTH = 280

/**
 * The coins left to spend, on a paper pill, in the pet's details and the Shop:
 * counting to what's new (`usePetReveal`), shown even at 0. Tapping it says how
 * coins are earned (ADR 0035).
 */
export default function GameWallet({
  palette,
  coins,
  pulse = null,
  monthlyHearts,
}: {
  palette: GamePalette
  /** Coins left to spend, as shown now. */
  coins: number
  /** What just changed: a "+N" rises over the count. */
  pulse?: GainPulse | null
  monthlyHearts: boolean
}) {
  const theme = useTheme()
  const streaks = usePreferences((state) => state.showStreaks)
  const scale = gamePixelScale()
  return (
    <Popover
      contentWidth={INFO_WIDTH}
      backgroundColor={cssColor(palette.card)}
      renderTrigger={({ onPress }) => (
        <Button
          onPress={onPress}
          accessibilityRole='button'
          accessibilityLabel={coinsText(coins)}
          accessibilityHint={i18n.t('pet.currency.infoTitle')}
          style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
        >
          <GameFrame
            kind='pill'
            palette={palette}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 2 * scale,
              paddingHorizontal: 4 * scale,
            }}
          >
            <PetWalletCounts
              coins={coins}
              pulse={pulse}
              fontSize={15}
              color={palette.ink}
              surface={cssColor(palette.pill)}
            />
          </GameFrame>
        </Button>
      )}
    >
      <View style={{ gap: 4 }}>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: palette.ink,
          }}
        >
          {i18n.t('pet.currency.infoTitle')}
        </Text>
        <Text style={{ fontSize: theme.fontSize('sm'), color: palette.inkAlt }}>
          {currencyInfoText({ monthlyHearts, streaks })}
        </Text>
      </View>
    </Popover>
  )
}
