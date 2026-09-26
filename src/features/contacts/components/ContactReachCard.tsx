import {
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  Mail as MailIcon,
  MapPin as MapPinIcon,
  MessageCircle as MessageCircleIcon,
  Navigation as NavigationIcon,
  Phone as PhoneIcon,
} from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import Button from '@/components/ui/Button'
import Copyeable from '@/components/ui/Copyeable'
import { AppIcon } from '@/components/ui/LucideIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { Contact } from '@/types/contact'
import { contactAddressLines } from '@/features/contacts/lib/contactChannels'

type Props = {
  contact: Contact
  /** International display form of the phone, when it parses. */
  phoneDisplay?: string
  onCall?: () => void
  onText?: () => void
  onEmail?: () => void
  onNavigate?: () => void
}

type Line = { id: string; icon: AppIcon; text: string }

/**
 * One card for reaching the contact. Collapsed, it shows the street line and
 * the Call / Text / Email / Navigate buttons. Expanded, it reveals the full
 * address, phone, and email as copyable text — the buttons stay the only
 * actions, so nothing is duplicated.
 */
const ContactReachCard = ({
  contact,
  phoneDisplay,
  onCall,
  onText,
  onEmail,
  onNavigate,
}: Props) => {
  const theme = useTheme()
  const { showContactPhone, showContactEmail } = usePreferences()
  const [expanded, setExpanded] = useState(false)

  const addressLines = contactAddressLines(contact)
  const phone =
    showContactPhone && contact.phone?.trim()
      ? phoneDisplay || contact.phone
      : null
  const email = showContactEmail && contact.email?.trim() ? contact.email : null

  const lines: Line[] = [
    ...(addressLines.length
      ? [{ id: 'address', icon: MapPinIcon, text: addressLines.join('\n') }]
      : []),
    ...(phone ? [{ id: 'phone', icon: PhoneIcon, text: phone }] : []),
    ...(email ? [{ id: 'email', icon: MailIcon, text: email }] : []),
  ]
  const actions: {
    id: string
    label: string
    icon: AppIcon
    onPress?: () => void
  }[] = [
    {
      id: 'call',
      label: i18n.t('call'),
      icon: PhoneIcon,
      onPress: phone ? onCall : undefined,
    },
    {
      id: 'text',
      label: i18n.t('contactDetails.text'),
      icon: MessageCircleIcon,
      onPress: phone ? onText : undefined,
    },
    {
      id: 'email',
      label: i18n.t('email'),
      icon: MailIcon,
      onPress: email ? onEmail : undefined,
    },
    {
      id: 'navigate',
      label: i18n.t('navigate'),
      icon: NavigationIcon,
      onPress: onNavigate,
    },
  ].filter((action) => action.onPress)

  if (lines.length === 0 && actions.length === 0) return null

  // Collapsed, only the first line of the first entry shows (the street when
  // there is an address). Anything beyond that is behind the chevron.
  const summary = lines[0]
  const summaryText = summary?.text.split('\n')[0]
  const expandable = lines.length > 1 || (summary?.text.includes('\n') ?? false)
  const textStyle = { fontSize: theme.fontSize('md') + 0.5 }

  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.numbers.borderRadiusLg,
        padding: 14,
        gap: 12,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
      }}
    >
      {summary && (
        <Pressable
          disabled={!expandable}
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole='button'
          accessibilityLabel={
            expandable
              ? `${i18n.t('contactDetails.contactInfo')}, ${
                  expanded
                    ? i18n.t('contactDetails.showLess')
                    : i18n.t('contactDetails.showMore')
                }`
              : undefined
          }
          accessibilityState={{ expanded }}
          style={{ gap: 10, paddingHorizontal: 2 }}
        >
          {(expanded ? lines : [{ ...summary, text: summaryText! }]).map(
            (line, index) => (
              <View
                key={line.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <View style={{ paddingTop: 2 }}>
                  <LucideIcon
                    icon={line.icon}
                    size={16}
                    color={theme.colors.textAlt}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {expanded ? (
                    <Copyeable textProps={{ style: textStyle }}>
                      {line.text}
                    </Copyeable>
                  ) : (
                    <Text
                      numberOfLines={1}
                      style={{ ...textStyle, fontFamily: theme.fonts.medium }}
                    >
                      {line.text}
                    </Text>
                  )}
                </View>
                {expandable && index === 0 && (
                  <LucideIcon
                    icon={expanded ? ChevronUpIcon : ChevronDownIcon}
                    size={18}
                    color={theme.colors.textAlt}
                  />
                )}
              </View>
            )
          )}
        </Pressable>
      )}
      {actions.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {actions.map((action) => (
            <Button
              key={action.id}
              onPress={action.onPress}
              accessibilityRole='button'
              accessibilityLabel={action.label}
              style={{
                flex: 1,
                alignItems: 'center',
                gap: 4,
                paddingTop: 10,
                paddingBottom: 8,
                borderRadius: theme.numbers.borderRadiusMd,
                backgroundColor: theme.colors.backgroundLighter,
              }}
            >
              <LucideIcon
                icon={action.icon}
                size={18}
                color={theme.colors.accent}
              />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: theme.fontSize('xs') + 1,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {action.label}
              </Text>
            </Button>
          ))}
        </View>
      )}
    </View>
  )
}

export default ContactReachCard
