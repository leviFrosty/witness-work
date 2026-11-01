import { analytics } from '@/lib/analytics'
import useContacts from '@/stores/contactsStore'
import { usePreferences } from '@/stores/preferences'
import type { MapCardDetail } from '@/types/map'
import {
  cardDetailFields,
  resolveCardDetail,
} from '@/features/map/lib/contactPins'

export default function useMapCardDetail(source: 'map' | 'settings') {
  const stored = usePreferences((s) => s.mapCardDetail)
  const set = usePreferences((s) => s.set)
  const defs = useContacts((s) => s.customFieldDefs)
  const detail = resolveCardDetail(stored, defs)

  const choose = (value: MapCardDetail) => {
    if (value === detail) return
    set({ mapCardDetail: value })
    analytics.capture('map_card_detail_changed', {
      detail: value.startsWith('field:') ? 'field' : value,
      source,
    })
  }

  return { detail, fields: cardDetailFields(defs), choose }
}
