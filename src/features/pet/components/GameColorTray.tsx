import type { ReactNode } from 'react'
import { View } from 'react-native'
import { cssColor, type GamePalette } from '@/features/pet/art/gameUi'
import { GameFrame, gamePixelScale } from '@/features/pet/components/GamePixels'
import type { ItemRarity } from '@/features/pet/lib/prices'

const PICKED_FRAME = {
  common: 'cardPicked',
  uncommon: 'cardUncommonPicked',
  rare: 'cardRarePicked',
} as const

const QUIET_INSET = 2

const NOTCH_PT = 10

const OVERLAP_PT = 6

export default function GameColorTray({
  column,
  cardWidth,
  cardGap,
  gap,
  palette,
  rarity = 'common',
  quiet = false,
  children,
}: {
  column: number | null
  cardWidth: number

  cardGap: number

  gap: number
  palette: GamePalette

  rarity?: ItemRarity

  quiet?: boolean
  children: ReactNode
}) {
  const scale = gamePixelScale()

  const rowCount = quiet
    ? Math.ceil(NOTCH_PT / scale) + QUIET_INSET
    : Math.ceil((NOTCH_PT + OVERLAP_PT) / scale)
  const rows = Array.from({ length: rowCount }, (_, i) =>
    quiet ? 2 * (rowCount - i) : 2 + 2 * i
  )
  const center =
    column === null ? 0 : column * (cardWidth + cardGap) + cardWidth / 2
  const ring = cssColor(
    rarity === 'rare'
      ? palette.rare
      : rarity === 'uncommon'
        ? palette.uncommon
        : palette.accent
  )
  return (
    <View style={column === null ? null : { marginTop: NOTCH_PT - gap }}>
      {column !== null && (
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            bottom: '100%',
            marginBottom: -scale * (quiet ? QUIET_INSET : 1),
            start: 0,
            end: 0,
            zIndex: 1,
            alignItems: 'flex-start',
          }}
        >
          {rows.map((width) => (
            <View
              key={width}
              style={{
                marginStart: center - (width * scale) / 2,
                width: width * scale,
                height: scale,
                backgroundColor: ring,
              }}
            />
          ))}
        </View>
      )}
      <GameFrame
        kind={column === null || quiet ? 'card' : PICKED_FRAME[rarity]}
        palette={palette}
        style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}
      >
        {children}
      </GameFrame>
    </View>
  )
}
