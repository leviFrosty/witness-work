import type { ReactNode } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'

/** An unlock's picture, square. */
export const UNLOCK_ART_SIZE = 52

/**
 * An unlock's art in its rounded tile, the same in its toast and its tray row,
 * so the tray previews what the toast showed.
 */
export default function UnlockArtTile({
  art,
}: {
  art: (size: number) => ReactNode
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: UNLOCK_ART_SIZE,
        height: UNLOCK_ART_SIZE,
        borderRadius: 16,
        borderCurve: 'continuous',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      {art(UNLOCK_ART_SIZE)}
    </View>
  )
}
