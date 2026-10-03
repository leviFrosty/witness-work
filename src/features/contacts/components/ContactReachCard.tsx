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
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import { liftedContent, useCopyAction } from '@/components/ui/Copyeable'
import { AppIcon } from '@/components/ui/LucideIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { addressToString, coordinateAsString } from '@/lib/address'
import i18n from '@/lib/locales'
import { contactMapLinks } from '@/lib/mapLinks'
import { shareUrl } from '@/lib/share'
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

type Line = {
  id: string
  icon: AppIcon
  text: string
  /** Tap action for the expanded line. */
  onPress?: () => void
  /** Long-press menu for the expanded line. */
  menu: ContextMenuEntries
}

/**
 * One card for reaching the contact. Collapsed, it shows the street line and
 * the Call / Text / Email / Navigate buttons. Expanded, it reveals the full
 * address, phone, and email: tapping one calls, emails, or navigates, and
 * long-pressing offers the same actions plus Copy.
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
  const copyAction = useCopyAction()

  const addressLines = contactAddressLines(contact)
  const phone =
    showContactPhone && contact.phone?.trim()
      ? phoneDisplay || contact.phone
      : null
  const email = showContactEmail && contact.email?.trim() ? contact.email : null

  const hasCoordinate =
    contact.coordinate?.latitude !== undefined &&
    contact.coordinate?.longitude !== undefined
  const mapLinks = contactMapLinks(contact)

  const lines: Line[] = [
    ...(addressLines.length
      ? [
          {
            id: 'address',
            icon: MapPinIcon,
            text: addressLines.join('\n'),
            onPress: onNavigate,
            menu: [
              [
                onNavigate && {
                  id: 'navigate',
                  title: i18n.t('navigate'),
                  systemImage: 'arrow.triangle.turn.up.right.diamond' as const,
                  onPress: onNavigate,
                },
                copyAction(addressToString(contact.address), {
                  id: 'copy_address',
                  title: i18n.t('copyAddress'),
                }),
                hasCoordinate &&
                  copyAction(coordinateAsString(contact), {
                    id: 'copy_coordinates',
                    title: i18n.t('copyCoordinates'),
                  }),
              ],
              [
                mapLinks && {
                  id: 'share_map_link',
                  title: i18n.t('shareMapLink'),
                  systemImage: 'square.and.arrow.up' as const,
                  actions: [
                    {
                      id: 'apple',
                      title: i18n.t('appleMaps'),
                      onPress: () => void shareUrl(mapLinks.apple),
                    },
                    {
                      id: 'google',
                      title: i18n.t('googleMaps'),
                      onPress: () => void shareUrl(mapLinks.google),
                    },
                  ],
                },
              ],
            ],
          },
        ]
      : []),
    ...(phone
      ? [
          {
            id: 'phone',
            icon: PhoneIcon,
            text: phone,
            onPress: onCall,
            menu: [
              onCall && {
                id: 'call',
                title: i18n.t('call'),
                systemImage: 'phone' as const,
                onPress: onCall,
              },
              onText && {
                id: 'message',
                title: i18n.t('message'),
                systemImage: 'message' as const,
                onPress: onText,
              },
              copyAction(phone),
            ],
          },
        ]
      : []),
    ...(email
      ? [
          {
            id: 'email',
            icon: MailIcon,
            text: email,
            onPress: onEmail,
            menu: [
              onEmail && {
                id: 'email',
                title: i18n.t('email'),
                systemImage: 'envelope' as const,
                onPress: onEmail,
              },
              copyAction(email),
            ],
          },
        ]
      : []),
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
      {summary &&
        (expanded ? (
          <View style={{ gap: 10, paddingHorizontal: 2 }}>
            {lines.map((line, index) => (
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
                <ContextMenu
                  style={[{ flex: 1, minWidth: 0 }, liftedContent.outset]}
                  analyticsSurface={`contact_${line.id}`}
                  onPress={line.onPress}
                  accessibilityLabel={line.text}
                  actions={line.menu}
                >
                  <Text style={[textStyle, liftedContent.inset]}>
                    {line.text}
                  </Text>
                </ContextMenu>
                {index === 0 && (
                  <Pressable
                    onPress={() => setExpanded(false)}
                    hitSlop={10}
                    accessibilityRole='button'
                    accessibilityLabel={`${i18n.t('contactDetails.contactInfo')}, ${i18n.t('contactDetails.showLess')}`}
                    accessibilityState={{ expanded }}
                  >
                    <LucideIcon
                      icon={ChevronUpIcon}
                      size={18}
                      color={theme.colors.textAlt}
                    />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        ) : (
          <Pressable
            disabled={!expandable}
            onPress={() => setExpanded(true)}
            accessibilityRole='button'
            accessibilityLabel={
              expandable
                ? `${i18n.t('contactDetails.contactInfo')}, ${i18n.t('contactDetails.showMore')}`
                : undefined
            }
            accessibilityState={{ expanded }}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 10,
              paddingHorizontal: 2,
            }}
          >
            <View style={{ paddingTop: 2 }}>
              <LucideIcon
                icon={summary.icon}
                size={16}
                color={theme.colors.textAlt}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ ...textStyle, fontFamily: theme.fonts.medium }}
              >
                {summaryText}
              </Text>
            </View>
            {expandable && (
              <LucideIcon
                icon={ChevronDownIcon}
                size={18}
                color={theme.colors.textAlt}
              />
            )}
          </Pressable>
        ))}
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
