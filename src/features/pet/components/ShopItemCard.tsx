import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import type { PetRoomSettings } from '@/types/pet'
import { resolveRoom, type SceneInput } from '@/features/pet/art'
import {
  SHOP_FRAME_INSET,
  shopCheckIcon,
  type ShopPalette,
} from '@/features/pet/art/shop'
import RoomOptionThumb from '@/features/pet/components/RoomOptionThumb'
import {
  CoinIcon,
  ShopFrame,
  ShopPixelImage,
  shopPixelScale,
} from '@/features/pet/components/ShopPixels'
import type { ResolvedWindow } from '@/features/pet/lib/liveWindow'
import { priceText, roomOptionLabel } from '@/features/pet/lib/roomLabels'
import {
  silhouetteRooms,
  silhouetteStyle,
  thumbRoom,
  thumbShowsPet,
} from '@/features/pet/lib/roomOptions'
import { shopThumbView, type ShopEntry } from '@/features/pet/lib/shopEntries'

/** A card's picture is this tall for its width. */
const THUMB_RATIO = 0.6

/** The words a screen reader says for a card. */
function cardLabel(entry: ShopEntry, name: string, isNew: boolean): string {
  switch (entry.state) {
    case 'secret':
      return i18n.t('pet.room.secret.a11y')
    case 'current':
      return entry.part === 'hat'
        ? i18n.t('pet.shop.itemWearing', { item: name })
        : i18n.t('pet.shop.itemInRoom', { item: name })
    case 'owned':
      return isNew
        ? i18n.t('pet.shop.itemNew', { item: name })
        : i18n.t('pet.shop.itemOwned', { item: name })
    case 'forSale':
      return i18n.t('pet.shop.itemPrice', {
        item: name,
        price: priceText(entry.price!),
      })
    case 'short':
      return i18n.t('pet.shop.itemNotEnough', {
        item: name,
        price: priceText(entry.price!),
      })
  }
}

/**
 * One item in the Shop: its picture from the room, its name, and its price or
 * whether it's worn. An owned item not picked yet says "New"; a secret not
 * found yet is only a silhouette.
 */
export default function ShopItemCard({
  entry,
  picked,
  isNew,
  width,
  palette,
  room,
  liveNow,
  thumbBase,
  onPress,
}: {
  entry: ShopEntry
  picked: boolean
  isNew: boolean
  /** The card's width in points. */
  width: number
  palette: ShopPalette
  room: PetRoomSettings
  liveNow: ResolvedWindow
  thumbBase: Omit<SceneInput, 'room'>
  onPress: () => void
}) {
  const theme = useTheme()
  const scale = shopPixelScale()
  const inset = SHOP_FRAME_INSET.card * scale
  const thumbW = Math.max(1, Math.floor((width - 2 * inset) / scale))
  const view = shopThumbView(
    entry.part,
    thumbW,
    Math.round(thumbW * THUMB_RATIO)
  )
  const secret = entry.state === 'secret'
  const name = secret
    ? i18n.t('pet.room.secret.label')
    : roomOptionLabel(entry.part, entry.option)

  const sceneOf = (settings: PetRoomSettings): SceneInput => ({
    ...thumbBase,
    pet: thumbShowsPet(entry.part) ? thumbBase.pet : null,
    room: resolveRoom(settings, liveNow),
  })
  let input: SceneInput
  let silhouette
  if (secret) {
    const shapes = silhouetteRooms(room, entry.part, entry.option)
    input = sceneOf(shapes.room)
    silhouette = {
      references: shapes.references.map(sceneOf),
      style: silhouetteStyle(entry.part),
    }
  } else input = sceneOf(thumbRoom(room, entry.part, entry.option))

  const trailing = () => {
    if (entry.state === 'forSale' || entry.state === 'short')
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <CoinIcon />
          <Text
            style={{
              fontSize: 14,
              fontFamily: theme.fonts.bold,
              fontVariant: ['tabular-nums'],
              color: entry.state === 'short' ? palette.inkAlt : palette.ink,
            }}
          >
            {formatNumber(entry.price!)}
          </Text>
        </View>
      )
    if (entry.state === 'current')
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <ShopPixelImage
            cacheKey={`check|${palette.ink}`}
            make={() => shopCheckIcon(palette.ink)}
          />
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              fontFamily: theme.fonts.bold,
              color: palette.ink,
            }}
          >
            {entry.part === 'hat'
              ? i18n.t('pet.shop.wearing')
              : i18n.t('pet.shop.inRoom')}
          </Text>
        </View>
      )
    return null
  }

  return (
    <Button
      onPress={onPress}
      accessibilityRole='button'
      accessibilityState={{ selected: picked }}
      accessibilityLabel={cardLabel(entry, name, isNew)}
      pointerEffect='tint'
      style={{ width }}
    >
      <ShopFrame
        kind={picked ? 'cardPicked' : 'card'}
        palette={palette}
        style={{ padding: inset, gap: 6 }}
      >
        <View>
          <RoomOptionThumb
            input={input}
            view={view}
            width={view[2] * scale}
            silhouette={silhouette}
          />
          {isNew && (
            <ShopFrame
              kind='newTag'
              palette={palette}
              style={{
                position: 'absolute',
                top: 2 * scale,
                end: 2 * scale,
                paddingHorizontal: 3 * scale,
                paddingVertical: scale,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: theme.fonts.bold,
                  color: palette.newInk,
                }}
              >
                {i18n.t('pet.room.secret.new')}
              </Text>
            </ShopFrame>
          )}
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            minHeight: 22,
            paddingHorizontal: 2,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontSize: 13,
              fontFamily: theme.fonts.semiBold,
              color: secret ? palette.inkAlt : palette.ink,
            }}
          >
            {name}
          </Text>
          {trailing()}
        </View>
      </ShopFrame>
    </Button>
  )
}
