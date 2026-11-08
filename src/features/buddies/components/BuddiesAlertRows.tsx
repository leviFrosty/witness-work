import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { ScopedSwitchRow } from '@/features/buddies/components/ScopedSettingRows'
import {
  useBuddySettingsScope,
  useScopedAlert,
} from '@/features/buddies/hooks/useBuddySettingsScope'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'

export default function BuddiesAlertRows() {
  const { buddy } = useBuddySettingsScope()
  const joinRequests = useScopedAlert('joinRequests')
  const badgeAlerts = useScopedAlert('badges')
  const showBadges = usePreferences((state) => state.showBadges)

  return (
    <>
      <ScopedSwitchRow
        setting={joinRequests}
        label={i18n.t('buddies_askToJoinAlerts')}
        info={
          buddy
            ? i18n.t('buddies_buddyAskToJoinAlertsInfo', {
                name: buddyDisplayName(buddy),
              })
            : i18n.t('buddies_askToJoinAlertsInfo')
        }
        lastInSection={!showBadges}
      />
      {showBadges ? (
        <ScopedSwitchRow
          setting={badgeAlerts}
          label={i18n.t('buddies_badgeAlerts')}
          info={i18n.t('buddies_badgeAlertsInfo')}
          lastInSection
        />
      ) : null}
    </>
  )
}
