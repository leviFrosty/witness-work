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

const NOTCH_PT = 10

const OVERLAP_PT = 6

export default function GameColorTray({
  column,
  cardWidth,
  cardGap,
  gap,
  palette,
  rarity = 'common',
  children,
}: {
  column: number | null
  cardWidth: number

  cardGap: number

  gap: number
  palette: GamePalette

  rarity?: ItemRarity
  children: ReactNode
}) {
  const scale = gamePixelScale()

  const rows = Array.from(
    { length: Math.ceil((NOTCH_PT + OVERLAP_PT) / scale) },
    (_, i) => 2 + 2 * i
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
            marginBottom: -scale,
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
        kind={column === null ? 'card' : PICKED_FRAME[rarity]}
        palette={palette}
        style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}
      >
        {children}
      </GameFrame>
    </View>
  )
}
