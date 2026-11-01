import type { ReactNode } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'

export const RAIL_WIDTH = 36
export const RAIL_DOT = 28

export const LEG_HEIGHT = 30

const LINE_WIDTH = 2

export function RailLine({ height }: { height?: number }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: RAIL_WIDTH,
        alignItems: 'center',
        ...(height === undefined ? { alignSelf: 'stretch' } : { height }),
      }}
    >
      <View
        style={{
          width: LINE_WIDTH,
          flex: 1,
          backgroundColor: theme.colors.border,
        }}
      />
    </View>
  )
}

export function RailDot({
  children,
  filled = true,
  lineBelow,
}: {
  children: ReactNode
  filled?: boolean
  lineBelow: boolean
}) {
  const theme = useTheme()
  return (
    <View
      style={{ width: RAIL_WIDTH, alignItems: 'center', alignSelf: 'stretch' }}
    >
      <View
        style={{
          width: RAIL_DOT,
          height: RAIL_DOT,
          borderRadius: RAIL_DOT / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled ? theme.colors.accent : theme.colors.card,
          borderWidth: filled ? 0 : 2,
          borderColor: theme.colors.accent,
        }}
      >
        {children}
      </View>
      {lineBelow && (
        <View
          style={{
            width: LINE_WIDTH,
            flex: 1,
            backgroundColor: theme.colors.border,
          }}
        />
      )}
    </View>
  )
}
