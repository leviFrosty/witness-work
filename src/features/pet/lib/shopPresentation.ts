import { Platform } from 'react-native'
import { useDisplayRegions } from '@/stores/displayRegions'

/**
 * Whether the Shop opens as an iOS sheet: where the window is compact (iPhone,
 * iPhone Duo closed). Where it's regular width (iPad, iPhone Duo open) it opens
 * full screen, and on Android as a full-screen modal. Read when it opens: a
 * presented screen keeps its presentation.
 */
export function petShopOpensAsSheet(): boolean {
  if (Platform.OS !== 'ios') return false
  const regions = useDisplayRegions.getState().regions
  return regions ? regions.horizontalSizeClass !== 'regular' : !Platform.isPad
}
