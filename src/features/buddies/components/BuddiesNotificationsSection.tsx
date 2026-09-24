import Button from '@/components/ui/Button'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import useNotificationPermission from '@/features/buddies/hooks/useNotificationPermission'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Buddies pushes on this device: a switch once iOS allows notifications,
 * otherwise a way to allow them.
 */
export default function BuddiesNotificationsSection() {
  const theme = useTheme()
  const { granted, needsSettings, turnOn } = useNotificationPermission()
  const enabled = useBuddies((state) => state.notificationsEnabled)

  if (granted === null) return null

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
          // Re-registers with or without push templates for this device.
          void registerBuddiesPush().catch((error) =>
            logger.warn('[buddies] push registration', error)
          )
        }}
        lastInSection
      />
    </Section>
  )
}
