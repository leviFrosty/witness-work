import { useState } from 'react'
import i18n from '@/lib/locales'
import { TerritoryMapEditorFrame } from '@/features/territories/components/TerritoryMapEditor'
import TerritoryLocationField from '@/features/territories/components/TerritoryLocationField'
import type { Coordinate } from '@/types/contact'

export default function TerritoryPinEditor({
  pin,
  fromLink,
  around,
  onClose,
  onDone,
}: {
  pin: Coordinate | undefined
  fromLink: boolean
  around: Coordinate | undefined
  onClose: () => void
  onDone: (pin: Coordinate | undefined) => void
}) {
  const [draft, setDraft] = useState(pin)
  return (
    <TerritoryMapEditorFrame
      title={i18n.t('territories.placeOnMap')}
      onClose={onClose}
      onDone={() => onDone(draft)}
      testID='territory-pin-editor'
    >
      <TerritoryLocationField
        fill
        coordinate={draft}
        fromLink={fromLink && draft === pin}
        onChange={setDraft}
        onClear={() => setDraft(undefined)}
        around={draft ?? around}
        pinId='territory-pin'
      />
    </TerritoryMapEditorFrame>
  )
}
