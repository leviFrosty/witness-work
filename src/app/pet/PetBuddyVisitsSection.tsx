import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddySettings } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import type { GamePalette } from '@/features/pet/art/gameUi'
import { GameSection, GameSwitchRow } from '@/features/pet/components/GameRows'

/**
 * Pet Settings' buddies part: whether buddies' pets visit at all (All Buddies),
 * then each buddy who shares a pet, on or off (their own setting, the same one
 * as in their Buddies settings).
 */
export default function PetBuddyVisitsSection({
  palette,
}: {
  palette: GamePalette
}) {
  const sharing = useBuddies((state) => state.sharing)
  const buddies = useBuddies((state) => state.buddies)
  const withPets = buddies.filter(
    (buddy) => buddy.status === 'active' && buddy.pet
  )

  return (
    <GameSection
      title={i18n.t('pet.settings.buddiesTitle')}
      footer={
        withPets.length === 0 ? i18n.t('pet.settings.noBuddyPets') : undefined
      }
      palette={palette}
    >
      <GameSwitchRow
        label={i18n.t('pet.settings.visits')}
        info={i18n.t('pet.settings.visitsInfo')}
        value={sharing.petVisits}
        onValueChange={(petVisits) => {
          analytics.capture('buddies_sharing_changed', {
            setting: 'pet_visits',
            scope: 'all',
            enabled: petVisits,
          })
          void buddiesEngine.setSharing({ petVisits }).catch(() => {
            // Saved here; the next change or sync writes the roster.
          })
        }}
        palette={palette}
      />
      {withPets.map((buddy) => (
        <GameSwitchRow
          key={buddy.inboxId}
          label={buddyDisplayName(buddy)}
          description={buddy.pet?.name}
          value={buddySettings(sharing, buddy).settings.petVisits}
          onValueChange={(petVisits) => {
            analytics.capture('buddies_sharing_changed', {
              setting: 'pet_visits',
              scope: 'buddy',
              enabled: petVisits,
            })
            buddiesEngine.setPetVisits(buddy.inboxId, petVisits)
          }}
          palette={palette}
        />
      ))}
    </GameSection>
  )
}
