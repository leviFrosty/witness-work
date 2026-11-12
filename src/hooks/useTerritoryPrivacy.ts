import { territoryPrivacyOn } from '@/lib/territoryPrivacy'
import { usePreferences } from '@/stores/preferences'

export const useTerritoryPrivacy = () => usePreferences(territoryPrivacyOn)
