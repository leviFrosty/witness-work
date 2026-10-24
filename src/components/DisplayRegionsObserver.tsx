import { useEffect } from 'react'
import { Dimensions, StyleSheet } from 'react-native'
import DisplayRegionsView, {
  type DisplayRegions,
} from '../../modules/display-regions'
import { useDisplayRegions } from '@/stores/displayRegions'

/**
 * React Native reads the window size from the key window and drops changes that
 * land while the app isn't active, so opening or closing iPhone Duo can leave
 * it on the other display's size: Home then lays out two columns on the outer
 * display. This view fills the window, so its own size is the true one.
 */
function correctWindowSize(regions: DisplayRegions | null) {
  if (!regions) return
  const window = Dimensions.get('window')
  if (
    Math.abs(window.width - regions.width) < 0.5 &&
    Math.abs(window.height - regions.height) < 0.5
  )
    return
  Dimensions.set({
    window: { ...window, width: regions.width, height: regions.height },
    screen: Dimensions.get('screen'),
  })
}

/** Fills the window, so the regions it reports are in window coordinates. */
export default function DisplayRegionsObserver() {
  // A late, stale report from React Native is put right again.
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () =>
      correctWindowSize(useDisplayRegions.getState().regions)
    )
    return () => subscription.remove()
  }, [])

  return (
    <DisplayRegionsView
      style={StyleSheet.absoluteFill}
      onRegionsChange={(regions) => {
        correctWindowSize(regions)
        useDisplayRegions.setState({ regions })
      }}
    />
  )
}
