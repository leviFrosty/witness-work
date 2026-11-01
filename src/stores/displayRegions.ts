import { create } from 'zustand'
import type { DisplayRegions } from '../../modules/display-regions'

export const useDisplayRegions = create<{ regions: DisplayRegions | null }>(
  () => ({ regions: null })
)
