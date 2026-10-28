import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { GamePalette } from '@/features/pet/art/gameUi'
import { GameButton } from '@/features/pet/components/GameControls'
import { gamePixelScale } from '@/features/pet/components/GamePixels'
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
  /** A check before the label: it's owned. */
  owned?: boolean
  /** A coin beside the label, and a number after it. */
  coin?: boolean
  amount?: number
  a11y: string
  onPress?: () => void
}

/**
 * The picked item and what can be done with it here: buy it, or what's missing.
 * An owned one says so and where it's used (the pet's details wear and place
 * things); a secret only says it's found, never sold.
 */
export default function ShopBuyPanel({
  entry,
  wallet,
  petName,
  palette,
  onBuy,
  layout,
}: {
  entry: ShopEntry
  /** Coins left to spend. */
  wallet: number
  petName: string
  palette: GamePalette
  onBuy: () => void
  /** `row`: name beside the button (a bar); `stack`: the button under it. */
  layout: 'row' | 'stack'
}) {
  const theme = useTheme()
  const scale = gamePixelScale()
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
    case 'current':
      sub =
        entry.state === 'current'
          ? hat
            ? i18n.t('pet.shop.wearingNow')
            : i18n.t('pet.shop.inRoomNow')
          : i18n.t('pet.shop.ownedHint', { name: petName })
      action = {
        label: i18n.t('pet.shop.owned'),
        owned: true,
        a11y: i18n.t('pet.shop.itemOwned', { item: name }),
      }
      break
    case 'secret':
      sub = i18n.t('pet.shop.secretHint')
      break
  }

  const button = action && (
    <GameButton
      label={action.label}
      icon={action.owned ? 'check' : undefined}
      coin={action.coin}
      amount={action.amount}
      onPress={action.onPress}
      accessibilityLabel={action.a11y}
      palette={palette}
      style={
        layout === 'row' ? { flexShrink: 0, minWidth: 60 * scale } : undefined
      }
    />
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
