import { useEffect } from 'react'
import { Dimensions, StyleSheet } from 'react-native'
import DisplayRegionsView, {
  type DisplayRegions,
} from '../../modules/display-regions'
import { useDisplayRegions } from '@/stores/displayRegions'

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

export default function DisplayRegionsObserver() {
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
