import type { ReactNode } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'

export const UNLOCK_ART_SIZE = 52

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
