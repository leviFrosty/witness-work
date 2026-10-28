import type { ReactNode } from 'react'
import { View, type AccessibilityRole } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import type { PetRoomSettings } from '@/types/pet'
import { resolveRoom, type SceneInput } from '@/features/pet/art'
import { GAME_FRAME_INSET, type GamePalette } from '@/features/pet/art/gameUi'
import { GameIcon } from '@/features/pet/components/GameControls'
import {
  CoinIcon,
  GameFrame,
  gamePixelScale,
} from '@/features/pet/components/GamePixels'
import RoomOptionThumb, {
  type ThumbSilhouette,
} from '@/features/pet/components/RoomOptionThumb'
import type { ResolvedWindow } from '@/features/pet/lib/liveWindow'
import {
  silhouetteRooms,
  silhouetteStyle,
  thumbRoom,
  thumbShowsPet,
  type RoomChoicePart,
} from '@/features/pet/lib/roomOptions'
import { shopThumbView } from '@/features/pet/lib/shopEntries'

/** A card's picture is this tall for its width. */
const THUMB_RATIO = 0.6
/** The scene's height, in pixels: no picture is taller. */
const SCENE_H = 100
/** The name row's least height. */
const NAME_ROW = 22

/** A card's picture size, in Shop pixels, for a card `width` points wide. */
function thumbPixels(width: number, scale: number) {
  const inset = GAME_FRAME_INSET.card * scale
  const w = Math.max(1, Math.floor((width - 2 * inset) / scale))
  return { inset, w, h: Math.min(SCENE_H, Math.round(w * THUMB_RATIO)) }
}

/** Where the card grid's columns fall, for a grid `gridWidth` points wide. */
export function itemGridColumns(gridWidth: number, gap: number) {
  /** About how wide a card is before another column fits. */
  const minWidth = 160
  const columns = Math.max(
    2,
    Math.min(4, Math.floor((gridWidth + gap) / (minWidth + gap)))
  )
  const cardWidth =
    gridWidth > 0 ? Math.floor((gridWidth - gap * (columns - 1)) / columns) : 0
  return { columns, cardWidth }
}

/** The "New" tag over a picture's corner, white on red. */
function NewTag({ palette }: { palette: GamePalette }) {
  const theme = useTheme()
  const scale = gamePixelScale()
  return (
    <GameFrame
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
    </GameFrame>
  )
}

/** A card's note after its name: a check and a word ("Wearing", "Owned"). */
export function CheckNote({
  label,
  palette,
}: {
  label: string
  palette: GamePalette
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flexShrink: 1,
      }}
    >
      <GameIcon name='check' color={palette.ink} />
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontSize: 12,
          fontFamily: theme.fonts.bold,
          color: palette.ink,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

/** A card's price after its name, muted while it's more than the wallet. */
export function PriceNote({
  price,
  short,
  palette,
}: {
  price: number
  short: boolean
  palette: GamePalette
}) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <CoinIcon />
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.bold,
          fontVariant: ['tabular-nums'],
          color: short ? palette.inkAlt : palette.ink,
        }}
      >
        {formatNumber(price)}
      </Text>
    </View>
  )
}

/**
 * One item as the pet screens show it, in the Shop and in the pet's details:
 * its picture from the room, its name, and a note after the name (its price, or
 * that it's worn). An owned item not picked yet says "New"; a secret not found
 * yet is only a silhouette.
 */
export default function GameItemCard({
  part,
  option,
  secret = false,
  name,
  note,
  picked,
  isNew = false,
  width,
  palette,
  room,
  liveNow,
  thumbBase,
  onPress,
  accessibilityRole,
  accessibilityState,
  accessibilityLabel,
}: {
  part: RoomChoicePart
  option: string
  /** A secret not found yet: its silhouette, named `???`. */
  secret?: boolean
  name: string
  note?: ReactNode
  /** Ringed in the accent: picked in the Shop, or in use. */
  picked: boolean
  isNew?: boolean
  /** The card's width in points. */
  width: number
  palette: GamePalette
  room: PetRoomSettings
  liveNow: ResolvedWindow
  thumbBase: Omit<SceneInput, 'room'>
  onPress: () => void
  accessibilityRole: AccessibilityRole
  accessibilityState: { selected?: boolean; checked?: boolean }
  accessibilityLabel: string
}) {
  const theme = useTheme()
  const scale = gamePixelScale()
  const { inset, w, h } = thumbPixels(width, scale)
  const view = shopThumbView(part, w, h)

  const sceneOf = (settings: PetRoomSettings): SceneInput => ({
    ...thumbBase,
    pet: thumbShowsPet(part) ? thumbBase.pet : null,
    room: resolveRoom(settings, liveNow),
  })
  let input: SceneInput
  let silhouette: ThumbSilhouette | undefined
  if (secret) {
    const shapes = silhouetteRooms(room, part, option)
    input = sceneOf(shapes.room)
    silhouette = {
      references: shapes.references.map(sceneOf),
      style: silhouetteStyle(part),
    }
  } else input = sceneOf(thumbRoom(room, part, option))

  return (
    <Button
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      pointerEffect='tint'
      style={{ width }}
    >
      <GameFrame
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
          {isNew && <NewTag palette={palette} />}
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            minHeight: NAME_ROW,
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
          {note}
        </View>
      </GameFrame>
    </Button>
  )
}

/**
 * The last card of a part in the pet's details: the Shop's sign over how many
 * more there are to buy, the size of the cards beside it. It opens the Shop.
 */
export function MoreInShopCard({
  count,
  width,
  palette,
  onPress,
}: {
  /** How many the Shop sells that aren't owned yet. */
  count: number
  width: number
  palette: GamePalette
  onPress: () => void
}) {
  const theme = useTheme()
  const scale = gamePixelScale()
  const { inset, w, h } = thumbPixels(width, scale)
  const more = i18n.t('pet.locker.moreCount' as TranslationKey, { count })
  return (
    <Button
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={`${i18n.t('pet.locker.moreInShop')}, ${more}`}
      pointerEffect='tint'
      style={{ width }}
    >
      <GameFrame
        kind='card'
        palette={palette}
        style={{ padding: inset, gap: 6 }}
      >
        <GameFrame
          kind='pill'
          palette={palette}
          style={{
            width: w * scale,
            height: h * scale,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <GameIcon name='shop' color={palette.ink} />
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              fontFamily: theme.fonts.semiBold,
              color: palette.inkAlt,
            }}
          >
            {more}
          </Text>
        </GameFrame>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            minHeight: NAME_ROW,
            paddingHorizontal: 2,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontSize: 13,
              fontFamily: theme.fonts.bold,
              color: palette.ink,
            }}
          >
            {i18n.t('pet.locker.moreInShop')}
          </Text>
          <GameIcon name='forward' color={palette.inkAlt} />
        </View>
      </GameFrame>
    </Button>
  )
}
