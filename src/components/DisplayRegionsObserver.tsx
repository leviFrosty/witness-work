import { StyleSheet } from 'react-native'
import DisplayRegionsView from '../../modules/display-regions'
import { useDisplayRegions } from '@/stores/displayRegions'

/** Fills the window, so the regions it reports are in window coordinates. */
export default function DisplayRegionsObserver() {
  return (
    <DisplayRegionsView
      style={StyleSheet.absoluteFill}
      onRegionsChange={(regions) => useDisplayRegions.setState({ regions })}
    />
  )
}
