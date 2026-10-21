import { create } from 'zustand'
import type { DisplayRegions } from '../../modules/display-regions'

/**
 * The window's iPhone Duo regions, from the one `DisplayRegionsObserver` at the
 * app root. Null until it reports, and on devices that never report.
 */
export const useDisplayRegions = create<{ regions: DisplayRegions | null }>(
  () => ({ regions: null })
)
