import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import type { ShopPalette } from '@/features/pet/art/shop'
import {
  CoinIcon,
  ShopFrame,
  shopPixelScale,
} from '@/features/pet/components/ShopPixels'
import {
  coinsText,
  priceText,
  roomOptionLabel,
} from '@/features/pet/lib/roomLabels'
import { shortBy } from '@/features/pet/lib/shop'
import type { ShopEntry } from '@/features/pet/lib/shopEntries'

/** What the button says and does for the picked item. */
type Action = {
  label: string
  /** A coin beside the label, and a number after it. */
  coin?: boolean
  amount?: number
  a11y: string
  onPress?: () => void
}

/**
 * The picked item and what can be done with it: buy it (or what's missing),
 * wear it or put it in the room, or that it's already there. A secret only says
 * it's found, never sold.
 */
export default function ShopBuyPanel({
  entry,
  wallet,
  palette,
  onBuy,
  onUse,
  layout,
}: {
  entry: ShopEntry
  /** Coins left to spend. */
  wallet: number
  palette: ShopPalette
  onBuy: () => void
  onUse: () => void
  /** `row`: name beside the button (a bar); `stack`: the button under it. */
  layout: 'row' | 'stack'
}) {
  const theme = useTheme()
  const scale = shopPixelScale()
  const hat = entry.part === 'hat'
  const secret = entry.state === 'secret'
  const name = secret
    ? i18n.t('pet.room.secret.label')
    : roomOptionLabel(entry.part, entry.option)

  let sub: string
  let action: Action | null = null
  const price = entry.price
  switch (entry.state) {
    case 'forSale':
      sub = i18n.t('pet.shop.leaves', { price: coinsText(wallet - price!) })
      action = {
        label: i18n.t('pet.shop.buy'),
        coin: true,
        amount: price!,
        a11y: i18n.t('pet.shop.buyA11y', {
          item: name,
          price: priceText(price!),
        }),
        onPress: onBuy,
      }
      break
    case 'short': {
      const missing = shortBy(price!, wallet)
      sub = i18n.t('pet.shop.earnCoins')
      action = {
        label: i18n.t('pet.shop.needMore' as TranslationKey, {
          count: missing,
        }),
        coin: true,
        a11y: i18n.t('pet.shop.needMoreA11y', {
          item: name,
          price: coinsText(missing),
        }),
      }
      break
    }
    case 'owned':
      sub = i18n.t('pet.shop.owned')
      action = {
        label: hat ? i18n.t('pet.shop.wear') : i18n.t('pet.shop.place'),
        a11y: hat ? i18n.t('pet.shop.wear') : i18n.t('pet.shop.place'),
        onPress: onUse,
      }
      break
    case 'current':
      sub = i18n.t('pet.shop.owned')
      action = {
        label: hat ? i18n.t('pet.shop.wearing') : i18n.t('pet.shop.inRoom'),
        a11y: hat ? i18n.t('pet.shop.wearing') : i18n.t('pet.shop.inRoom'),
      }
      break
    case 'secret':
      sub = i18n.t('pet.shop.secretHint')
      break
  }

  const enabled = !!action?.onPress
  const ink = enabled ? palette.onAccent : palette.inkAlt
  const button = action && (
    <Button
      onPress={action.onPress}
      disabled={!enabled}
      accessibilityRole='button'
      accessibilityLabel={action.a11y}
      accessibilityState={{ disabled: !enabled }}
      style={layout === 'row' ? { flexShrink: 0 } : null}
    >
      <ShopFrame
        kind={enabled ? 'button' : 'buttonOff'}
        palette={palette}
        style={{
          minHeight: Math.max(20 * scale, MIN_TOUCH_TARGET),
          minWidth: layout === 'row' ? 60 * scale : undefined,
          paddingHorizontal: 5 * scale,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ fontSize: 16, fontFamily: theme.fonts.bold, color: ink }}
        >
          {action.label}
        </Text>
        {action.coin && <CoinIcon />}
        {action.amount !== undefined && (
          <Text
            style={{
              fontSize: 16,
              fontFamily: theme.fonts.bold,
              fontVariant: ['tabular-nums'],
              color: ink,
              marginStart: -2,
            }}
          >
            {formatNumber(action.amount)}
          </Text>
        )}
      </ShopFrame>
    </Button>
  )

  return (
    <View
      style={
        layout === 'row'
          ? { flexDirection: 'row', alignItems: 'center', gap: 12 }
          : { gap: 12 }
      }
    >
      <View style={{ flex: layout === 'row' ? 1 : undefined, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: layout === 'row' ? 17 : 20,
            fontFamily: theme.fonts.bold,
            color: palette.ink,
          }}
        >
          {name}
        </Text>
        <Text
          numberOfLines={layout === 'row' ? 1 : 2}
          style={{ fontSize: 12, color: palette.inkAlt }}
        >
          {sub}
        </Text>
      </View>
      {button}
    </View>
  )
}
