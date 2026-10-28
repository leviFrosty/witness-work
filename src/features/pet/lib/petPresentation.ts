import { Platform } from 'react-native'
import { useDisplayRegions } from '@/stores/displayRegions'

/**
 * Whether the pet's details and the Shop open as iOS sheets: where the window
 * is compact (iPhone, iPhone Duo closed). Where it's regular width (iPad,
 * iPhone Duo open) they open full screen, and on Android as full-screen modals.
 * Read when one opens: a presented screen keeps its presentation.
 */
export function petOpensAsSheet(): boolean {
  if (Platform.OS !== 'ios') return false
  const regions = useDisplayRegions.getState().regions
  return regions ? regions.horizontalSizeClass !== 'regular' : !Platform.isPad
}

/**
 * From this wide, the details and the Shop put the room beside the items,
 * meeting at iPhone Duo's fold.
 */
export const PET_WIDE_FROM = 760
