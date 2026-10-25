import { View } from 'react-native'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddySettings } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Pet Settings' buddies part: whether buddies' pets visit at all (All Buddies),
 * then each buddy who shares a pet, on or off (their own setting, the same one
 * as in their Buddies settings).
 */
export default function PetBuddyVisitsSection() {
  const theme = useTheme()
  const sharing = useBuddies((state) => state.sharing)
  const buddies = useBuddies((state) => state.buddies)
  const withPets = buddies.filter(
    (buddy) => buddy.status === 'active' && buddy.pet
  )

  return (
    <View style={{ gap: 8 }}>
      <Text
        accessibilityRole='header'
        style={{
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
          marginLeft: 5,
        }}
      >
        {i18n.t('pet.settings.buddiesTitle')}
      </Text>
      <Section>
        <InputRowSwitch
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
          lastInSection={withPets.length === 0}
        />
        {withPets.map((buddy, i) => (
          <InputRowSwitch
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
            lastInSection={i === withPets.length - 1}
          />
        ))}
      </Section>
      {withPets.length === 0 && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
            marginLeft: 5,
          }}
        >
          {i18n.t('pet.settings.noBuddyPets')}
        </Text>
      )}
    </View>
  )
}
