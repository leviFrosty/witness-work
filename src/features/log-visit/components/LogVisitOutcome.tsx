import {
  CalendarClock as CalendarClockIcon,
  DoorClosed as DoorClosedIcon,
  MessageCircle as MessageCircleIcon,
} from 'lucide-react-native'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import ContactCard, {
  ContactCardBody,
  ContactCardSubtitle,
} from '@/components/ContactCard'
import { useContactStalenessColor } from '@/hooks/useContactStalenessColor'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import { addressToString } from '@/lib/addressToString'
import { dueFollowUpLabel } from '@/lib/suggestedContacts'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'

export default function LogVisitOutcome({
  contact,
  dueFollowUp,
  onConversation,
  onNotAtHome,
}: {
  contact: Contact

  dueFollowUp?: Visit
  onConversation: () => void
  onNotAtHome: () => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const stripeColor = useContactStalenessColor(contact)
  const address = addressToString(contact.address)
  const topic = dueFollowUp?.followUp?.topic?.trim()

  return (
    <ScrollView
      contentContainerStyle={{
        gap: 14,
        paddingHorizontal: 16,
        paddingTop: 18,
        paddingBottom: insets.bottom + 24,
      }}
    >
      <ContactCard stripeColor={stripeColor}>
        <ContactCardBody
          contact={contact}
          subtitle={
            address ? (
              <ContactCardSubtitle>{address}</ContactCardSubtitle>
            ) : null
          }
        />
      </ContactCard>
      {dueFollowUp && topic ? (
        <View
          accessible
          style={{
            flexDirection: 'row',
            gap: 10,
            padding: 12,
            borderRadius: theme.numbers.borderRadiusMd,
            backgroundColor: theme.colors.warnTranslucent,
          }}
        >
          <LucideIcon
            icon={CalendarClockIcon}
            size={theme.fontSize('md')}
            style={{ color: theme.colors.warnText, marginTop: 1 }}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.warnText,
              }}
            >
              {dueFollowUpLabel(dueFollowUp)}
            </Text>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.text,
              }}
            >
              {topic}
            </Text>
          </View>
        </View>
      ) : null}
      <OutcomeButton
        testID='log-visit-conversation'
        primary
        icon={MessageCircleIcon}
        title={i18n.t('conversation')}
        hint={i18n.t('logVisit_conversationHint')}
        onPress={onConversation}
      />
      <OutcomeButton
        testID='log-visit-not-at-home'
        icon={DoorClosedIcon}
        title={i18n.t('notAtHome')}
        hint={i18n.t('logVisit_notAtHomeHint')}
        onPress={onNotAtHome}
      />
    </ScrollView>
  )
}

function OutcomeButton({
  primary = false,
  icon,
  title,
  hint,
  onPress,
  testID,
}: {
  primary?: boolean
  icon: AppIcon
  title: string
  hint: string
  onPress: () => void
  testID: string
}) {
  const theme = useTheme()
  const color = primary ? theme.colors.textInverse : theme.colors.text
  return (
    <Button
      testID={testID}
      accessibilityRole='button'
      accessibilityLabel={title}
      accessibilityHint={hint}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: 72,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderRadius: theme.numbers.borderRadiusMd,
        borderWidth: primary ? 0 : 1,
        borderColor: theme.colors.border,
        backgroundColor: primary
          ? theme.colors.accent
          : theme.colors.backgroundLighter,
      }}
    >
      <LucideIcon icon={icon} size={24} style={{ color }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
            color,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: primary ? theme.colors.textInverse : theme.colors.textAlt,
            opacity: primary ? 0.9 : 1,
          }}
        >
          {hint}
        </Text>
      </View>
    </Button>
  )
}
