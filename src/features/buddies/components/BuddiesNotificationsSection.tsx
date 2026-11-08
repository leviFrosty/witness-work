import { useNavigation } from '@react-navigation/native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import IconButton from '@/components/ui/IconButton'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddiesAlertRows from '@/features/buddies/components/BuddiesAlertRows'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import { useBuddySettingsScope } from '@/features/buddies/hooks/useBuddySettingsScope'
import useNotificationPermission from '@/features/buddies/hooks/useNotificationPermission'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function BuddiesNotificationsSection() {
  const navigation = useNavigation<RootStackNavigation>()
  const { buddy } = useBuddySettingsScope()
  const { granted } = useNotificationPermission()
  const enabled = useBuddies((state) => state.notificationsEnabled)

  if (buddy)
    return granted && enabled ? (
      <BuddiesSection
        title={i18n.t('buddies_notifications')}
        footer={i18n.t('buddies_alertsThisDevice')}
      >
        <BuddiesAlertRows />
      </BuddiesSection>
    ) : null

  return (
    <Section>
      <InputRowButton
        label={i18n.t('buddies_notifications')}
        onPress={() => navigation.navigate('PreferencesNotifications')}
        lastInSection
      >
        <IconButton icon={ChevronForwardIcon} />
      </InputRowButton>
    </Section>
  )
}
