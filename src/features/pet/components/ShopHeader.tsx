import { useState } from 'react'
import { I18nManager, View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import Popover from '@/components/ui/Popover'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import { tracking } from '@/lib/tracking'
import {
  norenSign,
  shopBackIcon,
  type ShopPalette,
} from '@/features/pet/art/shop'
import {
  CoinIcon,
  ShopArtBox,
  ShopFrame,
  ShopPixelImage,
  shopPixelScale,
} from '@/features/pet/components/ShopPixels'
import { coinsText, currencyInfoText } from '@/features/pet/lib/roomLabels'

const INFO_WIDTH = 280

/** The Shop's sign: its name on a noren, translated, sized to the word. */
function ShopSign({ palette }: { palette: ShopPalette }) {
  const theme = useTheme()
  const scale = shopPixelScale()
  return (
    <ShopArtBox
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
    </ShopArtBox>
  )
}

/** The wallet: coins left to spend. Tapping it says how they're earned. */
export function ShopWallet({
  palette,
  wallet,
  monthlyHearts,
}: {
  palette: ShopPalette
  /** Coins left to spend. */
  wallet: number
  monthlyHearts: boolean
}) {
  const theme = useTheme()
  const streaks = usePreferences((state) => state.showStreaks)
  const scale = shopPixelScale()
  const amount = (value: number) => (
    <Text
      style={{
        fontSize: 15,
        fontFamily: theme.fonts.bold,
        color: palette.ink,
        fontVariant: ['tabular-nums'],
      }}
    >
      {formatNumber(value)}
    </Text>
  )
  return (
    <Popover
      contentWidth={INFO_WIDTH}
      renderTrigger={({ onPress }) => (
        <Button
          onPress={onPress}
          accessibilityRole='button'
          accessibilityLabel={coinsText(wallet)}
          accessibilityHint={i18n.t('pet.currency.infoTitle')}
          style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
        >
          <ShopFrame
            kind='pill'
            palette={palette}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingVertical: 2 * scale,
              paddingHorizontal: 4 * scale,
            }}
          >
            <CoinIcon />
            {amount(wallet)}
          </ShopFrame>
        </Button>
      )}
    >
      <View style={{ gap: 4 }}>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('pet.currency.infoTitle')}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {currencyInfoText({ monthlyHearts, streaks })}
        </Text>
      </View>
    </Popover>
  )
}

/** Pulls the back button's frame out past the screen's padding. */
const BACK_PULL = 12
/** The least room between the sign and what's beside it. */
const SIGN_GAP = 8

/**
 * Back, the sign in the middle, the wallet. Where the middle of the row has no
 * room for the sign (a narrow phone, a long translation, a big wallet), the
 * sign sits between the two instead.
 */
export default function ShopHeader({
  palette,
  wallet,
  monthlyHearts,
  onBack,
}: {
  palette: ShopPalette
  /** Coins left to spend. */
  wallet: number
  monthlyHearts: boolean
  onBack: () => void
}) {
  const [row, setRow] = useState(0)
  const [sign, setSign] = useState(0)
  const [walletWidth, setWalletWidth] = useState(0)
  const back = MIN_TOUCH_TARGET - BACK_PULL
  // Centered until measured: it fits on most screens.
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
      <Button
        onPress={onBack}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('pet.shop.back')}
        style={{
          width: MIN_TOUCH_TARGET,
          height: MIN_TOUCH_TARGET,
          marginStart: -BACK_PULL,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ShopPixelImage
          cacheKey={`back|${palette.ink}`}
          make={() => shopBackIcon(palette.ink)}
          style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : null}
        />
      </Button>
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
        <ShopWallet
          palette={palette}
          wallet={wallet}
          monthlyHearts={monthlyHearts}
        />
      </View>
    </View>
  )
}
