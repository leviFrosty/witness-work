import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { PetRoomSettings } from '@/types/pet'
import type { SceneInput } from '@/features/pet/art'
import type { GamePalette } from '@/features/pet/art/gameUi'
import GameItemCard, { PriceNote } from '@/features/pet/components/GameItemCard'
import type { ResolvedWindow } from '@/features/pet/lib/liveWindow'
import { priceText, roomOptionLabel } from '@/features/pet/lib/roomLabels'
import { isOwned, type ShopEntry } from '@/features/pet/lib/shopEntries'

/** The words a screen reader says for a card. */
function cardLabel(entry: ShopEntry, name: string): string {
  switch (entry.state) {
    case 'secret':
      return i18n.t('pet.room.secret.a11y')
    case 'current':
    case 'owned':
      return i18n.t('pet.shop.itemOwned', { item: name })
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
 * One item in the Shop: its picture from the room, its name, and its price.
 * Once bought or found it's stamped with a big check, says "Owned", and can't
 * be picked (it's worn and placed from the pet's details). A secret not found
 * yet is only a silhouette.
 */
export default function ShopItemCard({
  entry,
  picked,
  width,
  palette,
  room,
  liveNow,
  thumbBase,
  onPress,
}: {
  entry: ShopEntry
  picked: boolean
  /** The card's width in points. */
  width: number
  palette: GamePalette
  room: PetRoomSettings
  liveNow: ResolvedWindow
  thumbBase: Omit<SceneInput, 'room'>
  onPress: () => void
}) {
  const theme = useTheme()
  const secret = entry.state === 'secret'
  const owned = isOwned(entry)
  const name = secret
    ? i18n.t('pet.room.secret.label')
    : roomOptionLabel(entry.part, entry.option)
  const note =
    entry.state === 'forSale' || entry.state === 'short' ? (
      <PriceNote
        price={entry.price!}
        short={entry.state === 'short'}
        palette={palette}
      />
    ) : owned ? (
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontSize: 12,
          fontFamily: theme.fonts.bold,
          color: palette.inkAlt,
        }}
      >
        {i18n.t('pet.shop.owned')}
      </Text>
    ) : null
  return (
    <GameItemCard
      part={entry.part}
      option={entry.option}
      secret={secret}
      name={name}
      note={note}
      picked={picked}
      owned={owned}
      width={width}
      palette={palette}
      room={room}
      liveNow={liveNow}
      thumbBase={thumbBase}
      onPress={onPress}
      accessibilityRole='button'
      accessibilityState={{ selected: picked }}
      accessibilityLabel={cardLabel(entry, name)}
    />
  )
}
