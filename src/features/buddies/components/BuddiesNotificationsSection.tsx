import Button from '@/components/ui/Button'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { usePreferences } from '@/stores/preferences'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import { ScopedSwitchRow } from '@/features/buddies/components/ScopedSettingRows'
import {
  useBuddySettingsScope,
  useScopedAlert,
} from '@/features/buddies/hooks/useBuddySettingsScope'
import useNotificationPermission from '@/features/buddies/hooks/useNotificationPermission'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function BuddiesNotificationsSection() {
  const theme = useTheme()
  const { buddy } = useBuddySettingsScope()
  const { granted, needsSettings, turnOn } = useNotificationPermission()
  const enabled = useBuddies((state) => state.notificationsEnabled)
  const joinRequests = useScopedAlert('joinRequests')
  const badgeAlerts = useScopedAlert('badges')
  const showBadges = usePreferences((state) => state.showBadges)

  if (granted === null) return null

  const alertRows = (
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

  if (buddy)
    return granted && enabled ? (
      <BuddiesSection
        title={i18n.t('buddies_notifications')}
        footer={i18n.t('buddies_alertsThisDevice')}
      >
        {alertRows}
      </BuddiesSection>
    ) : null

  if (!granted) {
    return (
      <Section>
        <InputRowContainer
          label={i18n.t('buddies_notifications')}
          description={i18n.t('buddies_notificationsOff')}
          controlWidth='auto'
          lastInSection
        >
          <Button onPress={turnOn} hitSlop={10}>
            <Text
              style={{
                color: theme.colors.accent,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t(
                needsSettings ? 'buddies_openSettings' : 'buddies_turnOn'
              )}
            </Text>
          </Button>
        </InputRowContainer>
      </Section>
    )
  }

  return (
    <Section>
      <InputRowSwitch
        label={i18n.t('buddies_notifications')}
        info={i18n.t('buddies_notificationsInfo')}
        value={enabled}
        onValueChange={(notificationsEnabled) => {
          useBuddies.setState({ notificationsEnabled })

          void registerBuddiesPush().catch((error) =>
            logger.warn('[buddies] push registration', error)
          )
        }}
        lastInSection={!enabled}
      />
      {enabled ? alertRows : null}
    </Section>
  )
}
