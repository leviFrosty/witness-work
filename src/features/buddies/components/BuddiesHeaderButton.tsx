import { useNavigation } from '@react-navigation/native'
import { Users as UsersIcon } from 'lucide-react-native'
import HeaderPillButton from '@/components/ui/HeaderPillButton'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Schedule's way into Buddies, who share planned days. Shows a dot while
 * requests wait for confirmation.
 */
export default function BuddiesHeaderButton() {
  const navigation = useNavigation<RootStackNavigation>()
  const enabled = useBuddiesEnabled()
  const requests = useBuddies((state) => state.incomingClaims.length)

  if (!enabled) return null

  return (
    <HeaderPillButton
      icon={UsersIcon}
      label={i18n.t('buddies_title')}
      badge={requests > 0}
      accessibilityLabel={
        requests > 0 ? i18n.t('buddies_requestsWaitingA11y') : undefined
      }
      onPress={() => {
        analytics.capture('buddies_opened', {
          source: 'schedule_header',
          has_requests: requests > 0,
        })
        navigation.navigate('Buddies')
      }}
    />
  )
}
