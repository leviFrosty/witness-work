import { useNavigation } from '@react-navigation/native'
import { Users as UsersIcon } from 'lucide-react-native'
import HeaderPillButton from '@/components/ui/HeaderPillButton'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import useBuddiesAvailability from '@/features/buddies/hooks/useBuddiesAvailability'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Schedule's way into Buddies, who share planned days. Shows a dot while
 * requests wait for confirmation, a spinner while Buddies is confirmed for the
 * first time this session, and dims while Buddies is turned off on the server.
 */
export default function BuddiesHeaderButton({
  compact = false,
}: {
  /** Icon only, where the header has no room for the label. */
  compact?: boolean
} = {}) {
  const navigation = useNavigation<RootStackNavigation>()
  const availability = useBuddiesAvailability()
  const requests = useBuddies((state) => state.incomingClaims.length)

  if (availability === 'hidden') return null
  const disabled = availability === 'disabled'

  return (
    <HeaderPillButton
      icon={UsersIcon}
      label={i18n.t('buddies_title')}
      compact={compact}
      loading={availability === 'loading'}
      disabled={disabled}
      // Requests can't be confirmed while Buddies is off.
      badge={requests > 0 && !disabled}
      accessibilityLabel={
        disabled
          ? i18n.t('buddies_unavailableA11y')
          : requests > 0
            ? i18n.t('buddies_requestsWaitingA11y')
            : undefined
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
