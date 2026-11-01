import { useState } from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { tracking } from '@/lib/tracking'
import { norenSign, type GamePalette } from '@/features/pet/art/gameUi'
import { GameIconButton } from '@/features/pet/components/GameControls'
import {
  GameArtBox,
  gamePixelScale,
} from '@/features/pet/components/GamePixels'
import GameWallet from '@/features/pet/components/GameWallet'
import type { GainPulse } from '@/features/pet/hooks/usePetReveal'

function ShopSign({ palette }: { palette: GamePalette }) {
  const theme = useTheme()
  const scale = gamePixelScale()
  return (
    <GameArtBox
      cacheKey={`noren|${palette.dark ? 1 : 0}`}
      make={(w, h) => norenSign(palette, w, h)}
      style={{
        minWidth: 52 * scale,
        paddingTop: 5 * scale,
        paddingBottom: 3 * scale,
        paddingHorizontal: 18,
      }}
    >
      <Text
        accessibilityRole='header'
        numberOfLines={1}
        style={{
          textAlign: 'center',
          fontSize: 18,
          fontFamily: theme.fonts.bold,
          letterSpacing: tracking(1),
          color: palette.onAccent,
        }}
      >
        {i18n.t('pet.shop.title')}
      </Text>
    </GameArtBox>
  )
}

const BACK_PULL = 4

const SIGN_GAP = 8

export default function ShopHeader({
  palette,
  wallet,
  walletPulse,
  monthlyHearts,
  onBack,
}: {
  palette: GamePalette

  wallet: number

  walletPulse: GainPulse | null
  monthlyHearts: boolean
  onBack: () => void
}) {
  const [row, setRow] = useState(0)
  const [sign, setSign] = useState(0)
  const [walletWidth, setWalletWidth] = useState(0)
  const back = MIN_TOUCH_TARGET - BACK_PULL

  const centered =
    row === 0 ||
    (row / 2 - sign / 2 >= back + SIGN_GAP &&
      row / 2 + sign / 2 <= row - walletWidth - SIGN_GAP)
  return (
    <View
      onLayout={(event) => setRow(event.nativeEvent.layout.width)}
      style={{
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: centered ? 0 : SIGN_GAP,
      }}
    >
      <View style={{ marginStart: -BACK_PULL }}>
        <GameIconButton
          icon='back'
          label={i18n.t('pet.shop.back')}
          palette={palette}
          onPress={onBack}
        />
      </View>
      <View
        pointerEvents='box-none'
        style={
          centered
            ? { position: 'absolute', left: 0, right: 0, alignItems: 'center' }
            : { flex: 1, alignItems: 'center' }
        }
      >
        <View
          onLayout={(event) => setSign(event.nativeEvent.layout.width)}
          style={{ maxWidth: '100%' }}
        >
          <ShopSign palette={palette} />
        </View>
      </View>
      <View
        onLayout={(event) => setWalletWidth(event.nativeEvent.layout.width)}
        style={{ marginStart: 'auto' }}
      >
        <GameWallet
          palette={palette}
          coins={wallet}
          pulse={walletPulse}
          monthlyHearts={monthlyHearts}
        />
      </View>
    </View>
  )
}
