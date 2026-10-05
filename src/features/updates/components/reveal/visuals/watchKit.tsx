import { PropsWithChildren } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import { withAlpha } from '@/lib/color'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'

/** The watch case, its band stubs and crown, in visual units. */
export const WATCH = {
  width: 146,
  height: 178,
  band: 30,
  crown: 6,
  bezel: 7,
}
/** What the frame takes up, crown and bands included. */
export const WATCH_FRAME = {
  width: WATCH.width + WATCH.crown,
  height: WATCH.height + WATCH.band * 2,
}
/** The display inside the bezel. */
export const WATCH_SCREEN = {
  width: WATCH.width - WATCH.bezel * 2,
  height: WATCH.height - WATCH.bezel * 2,
}

/** The watch draws on black in either appearance; these are its greys. */
export const WATCH_COLORS = {
  screen: '#000000',
  case: '#1C1C1E',
  rim: '#3A3A3C',
  row: '#222224',
  text: '#FFFFFF',
  textAlt: '#8E8E93',
  track: '#2C2C2E',
}

/**
 * An Apple Watch drawn around `children`, which fill its display. The case is
 * dark in both appearances, like a midnight aluminium watch; the band follows
 * the scene so it sits back.
 */
export const WatchFrame = ({
  palette,
  style,
  children,
}: PropsWithChildren<{
  palette: WelcomePalette
  style?: StyleProp<ViewStyle>
}>) => {
  const band = withAlpha(palette.text, 0x24)
  return (
    <View
      style={[{ width: WATCH_FRAME.width, height: WATCH_FRAME.height }, style]}
    >
      {[0, 1].map((end) => (
        <View
          key={end}
          style={{
            position: 'absolute',
            left: 24,
            width: WATCH.width - 48,
            height: WATCH.band + 24,
            backgroundColor: band,
            borderRadius: 14,
            borderCurve: 'continuous',
            ...(end === 0 ? { top: 0 } : { bottom: 0 }),
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          right: 0,
          top: WATCH.band + 34,
          width: WATCH.crown + 4,
          height: 26,
          borderRadius: 3,
          backgroundColor: WATCH_COLORS.rim,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 1,
          top: WATCH.band + 76,
          width: WATCH.crown + 2,
          height: 36,
          borderRadius: 2,
          backgroundColor: WATCH_COLORS.rim,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: WATCH.band,
          left: 0,
          width: WATCH.width,
          height: WATCH.height,
          padding: WATCH.bezel,
          borderRadius: 40,
          borderCurve: 'continuous',
          backgroundColor: WATCH_COLORS.case,
          borderWidth: 1.5,
          borderColor: WATCH_COLORS.rim,
          shadowColor: palette.surfaceShadow,
          shadowOpacity: palette.surfaceShadowOpacity.focus,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: 33,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: WATCH_COLORS.screen,
          }}
        >
          {children}
        </View>
      </View>
    </View>
  )
}

/** A rounded list row, like a watchOS button. */
export const WatchRow = ({
  style,
  children,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) => (
  <View
    style={[
      {
        height: 28,
        borderRadius: 14,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: WATCH_COLORS.row,
      },
      style,
    ]}
  >
    {children}
  </View>
)
