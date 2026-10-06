import { randomUUID } from 'expo-crypto'
import type { FeatureKey } from '@/lib/featureAccess'

export type SupporterGateSurface =
  | 'accent_color'
  | 'avatar_background'
  | 'contact_background'
  | 'app_icon'
  | 'icloud_sync'
  | 'saved_views'
  | 'today_route'

/** Anonymous, ephemeral attribution for one visible gate visit. */
export type SupporterGateAttribution = {
  feature: FeatureKey
  source_screen: string
  gate_surface: SupporterGateSurface
  gate_placement: string
  gate_flow_id: string
}

export function createSupporterGateAttribution(
  feature: FeatureKey,
  sourceScreen: string,
  surface: SupporterGateSurface
): SupporterGateAttribution {
  return {
    feature,
    source_screen: sourceScreen,
    gate_surface: surface,
    gate_placement: `${feature} / ${sourceScreen} / ${surface}`,
    // Correlates this visit through checkout; never persisted or used as identity.
    gate_flow_id: randomUUID(),
  }
}
