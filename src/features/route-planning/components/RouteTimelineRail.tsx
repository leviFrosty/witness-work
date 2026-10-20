import type { ReactNode } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'

/** The timeline's left column: the line through the day and each stop's dot. */
export const RAIL_WIDTH = 36
export const RAIL_DOT = 28
/** Room between stops for the drive between them. */
export const LEG_HEIGHT = 30
/** The line, drawn like the one through a Contact's visit history. */
const LINE_WIDTH = 2

/**
 * A stretch of the line, for the drive between two points: as tall as `height`,
 * or as the row it's in.
 */
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

/**
 * A dot on the line: the stop's number, or an icon for the start and finish.
 * The line runs on below it unless it's the last point.
 */
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
