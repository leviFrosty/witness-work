import { Image, type ImageSource } from 'expo-image'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import type { DefaultNavigationMapProvider } from '@/stores/preferences'

type MapApp = Exclude<DefaultNavigationMapProvider, null>

const MAP_APP_ICONS: Record<MapApp, number> = {
  apple: require('@/assets/map-apps/apple-maps.png'),
  google: require('@/assets/map-apps/google-maps.png'),
  waze: require('@/assets/map-apps/waze.png'),
}

export const mapAppIconSource = (app: MapApp) => MAP_APP_ICONS[app]

const CORNER_RATIO = 0.225

interface Props {
  source: ImageSource | number
  size: number
  style?: StyleProp<ViewStyle>
}

const AppIconImage = ({ source, size, style }: Props) => {
  const radius = size * CORNER_RATIO
  return (
    <View
      style={[
        styles.mask,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      <Image
        source={source}
        style={{ width: size, height: size }}
        contentFit='cover'
        accessible={false}
      />
      <View
        pointerEvents='none'
        style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: radius }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  mask: {
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  edge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
    borderCurve: 'continuous',
  },
})

export default AppIconImage
