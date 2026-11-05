import type { ReactNode } from 'react'
import { View } from 'react-native'
import { cssColor, type GamePalette } from '@/features/pet/art/gameUi'
import { GameFrame, gamePixelScale } from '@/features/pet/components/GamePixels'

/** Between the card's row and the tray, in points: the notch's room. */
const NOTCH_PT = 10
/** How far the notch reaches up into the card's ring, in points. */
const OVERLAP_PT = 6

/**
 * A picked card's colours, hung from it: a tray in the card's own accent ring,
 * joined to the card above by a notch under its column, so the colours read as
 * that card's. `column` null: nothing picked above it, so a plain card's frame
 * and no notch. Placed right after the card's row, in place of the row gap
 * (`gap`).
 */
export default function GameColorTray({
  column,
  cardWidth,
  cardGap,
  gap,
  palette,
  children,
}: {
  /** The picked card's column in the row above; null for none. */
  column: number | null
  cardWidth: number
  /** Between the cards in a row. */
  cardGap: number
  /** Between the row above and the tray, taken by the notch. */
  gap: number
  palette: GamePalette
  children: ReactNode
}) {
  const scale = gamePixelScale()
  // Pixel rows from the card's ring down to the tray's, each two pixels wider:
  // a solid arrow up at the card.
  const rows = Array.from(
    { length: Math.ceil((NOTCH_PT + OVERLAP_PT) / scale) },
    (_, i) => 2 + 2 * i
  )
  const center =
    column === null ? 0 : column * (cardWidth + cardGap) + cardWidth / 2
  const ring = cssColor(palette.accent)
  return (
    <View
      // The notch's room in place of the row gap.
      style={column === null ? null : { marginTop: NOTCH_PT - gap }}
    >
      {column !== null && (
        <View
          pointerEvents='none'
          style={{
            // Up from the tray's ring into the card's, so the two join.
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
        kind={column === null ? 'card' : 'cardPicked'}
        palette={palette}
        style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}
      >
        {children}
      </GameFrame>
    </View>
  )
}
