import { Platform } from 'react-native'
import { useDisplayRegions } from '@/stores/displayRegions'

export function petOpensAsSheet(): boolean {
  if (Platform.OS !== 'ios') return false
  const regions = useDisplayRegions.getState().regions
  return regions ? regions.horizontalSizeClass !== 'regular' : !Platform.isPad
}

export const PET_WIDE_FROM = 760
