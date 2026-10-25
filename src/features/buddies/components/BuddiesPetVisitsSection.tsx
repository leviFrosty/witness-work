import i18n from '@/lib/locales'
import usePet from '@/stores/pet'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import { ScopedSwitchRow } from '@/features/buddies/components/ScopedSettingRows'
import { useScopedSetting } from '@/features/buddies/hooks/useBuddySettingsScope'

/**
 * Whether buddies' pets visit this User's pet on days they go out together, in
 * the current scope. Only once the User has a pet.
 */
export default function BuddiesPetVisitsSection() {
  const petVisits = useScopedSetting('petVisits')
  const hasPet = usePet((state) => state.pet !== null)
  if (!hasPet) return null
  return (
    <BuddiesSection title={i18n.t('buddies_petSettingsTitle')}>
      <ScopedSwitchRow
        setting={petVisits}
        label={i18n.t('buddies_petVisits')}
        info={i18n.t('buddies_petVisitsInfo')}
        lastInSection
      />
    </BuddiesSection>
  )
}
