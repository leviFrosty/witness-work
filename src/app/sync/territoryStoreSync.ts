import { territoryPrivacyOn } from '@/lib/territoryPrivacy'
import { usePreferences } from '@/stores/preferences'
import {
  applyLedger,
  countPersonalTerritories,
  isDeleted,
  ledgerToSlice,
  type PersonalLedger,
  personalTerritories,
  sliceToLedger,
  type TerritorySyncSlice,
} from '@/features/territories/lib/personalSync'
import { formatDoorAddress } from '@/features/territories/lib/territoryTitle'
import {
  heldTerritories,
  useTerritories,
} from '@/features/territories/stores/territories'
import type { Territory } from '@/features/territories/types/territory'

export function localTerritorySnapshot(): TerritorySyncSlice {
  useTerritories.getState().stampLedger()
  return ledgerToSlice(useTerritories.getState().ledger)
}

function place(
  after: PersonalLedger,
  before: PersonalLedger,
  replace: boolean
) {
  const state = useTerritories.getState()
  const held = heldTerritories(state)
  const personal = personalTerritories(state.territories, held)
  const result = applyLedger({
    before,
    after,
    personal,
    held,
    privacy: territoryPrivacyOn(usePreferences.getState()),
    formatAddress: formatDoorAddress,
  })
  const kept = replace
    ? result.personal.filter((territory) => result.ledger[territory.id])
    : result.personal
  const byId = new Map(kept.map((territory) => [territory.id, territory]))
  const territories: Territory[] = []
  for (const territory of state.territories) {
    if (territory.shared || territory.received) {
      territories.push(territory)
      continue
    }
    const next = byId.get(territory.id)
    if (!next) continue
    territories.push(next)
    byId.delete(territory.id)
  }
  territories.push(...byId.values())
  useTerritories.setState({ ledger: result.ledger, territories })
  const photos = result.removed
    .filter((territory) => isDeleted(result.ledger[territory.id]))
    .map((territory) => territory.photo)
  if (photos.some(Boolean))
    void import('@/features/territories/lib/cardPhoto').then(
      ({ deleteCardPhoto }) => {
        for (const photo of photos) void deleteCardPhoto(photo)
      }
    )
}

export function applyTerritorySnapshot(
  slice: Partial<TerritorySyncSlice>
): void {
  place(sliceToLedger(slice), useTerritories.getState().ledger, false)
}

export function replaceTerritorySnapshot(
  slice: Partial<TerritorySyncSlice>
): void {
  place(sliceToLedger(slice), {}, true)
}

export function hasTerritoryData(): boolean {
  const state = useTerritories.getState()
  return (
    personalTerritories(state.territories, heldTerritories(state)).length > 0 ||
    countPersonalTerritories(state.ledger) > 0
  )
}
