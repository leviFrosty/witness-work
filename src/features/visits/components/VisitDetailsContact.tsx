import {
  MessageCircle as MessageCircleIcon,
  Navigation as NavigationIcon,
  Phone as PhoneIcon,
} from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { getLocales } from 'expo-localization'
import ContactCard, {
  ContactCardBody,
  ContactCardSubtitle,
} from '@/components/ContactCard'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import { useContactStalenessColor } from '@/hooks/useContactStalenessColor'
import { addressToString, navigateTo } from '@/lib/address'
import i18n from '@/lib/locales'
import { handleCall, handleMessage } from '@/lib/phone'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'
import type { RootStackNavigation } from '@/types/rootStack'

export default function VisitDetailsContact({
  contact,
  onOpen,
}: {
  contact: Contact
  onOpen: () => void
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const showContactPhone = usePreferences((s) => s.showContactPhone)
  const defaultNavigationMapProvider = usePreferences(
    (s) => s.defaultNavigationMapProvider
  )
  const stripeColor = useContactStalenessColor(contact)
  const address = addressToString(contact.address)
  const phone =
    showContactPhone && contact.phone?.trim()
      ? parsePhoneNumber(contact.phone, {
          regionCode:
            contact.phoneRegionCode || getLocales()[0]?.regionCode || '',
        })
      : null

  const actions: {
    id: string
    label: string
    icon: AppIcon
    onPress: () => void
  }[] = [
    ...(phone
      ? [
          {
            id: 'call',
            label: i18n.t('call'),
            icon: PhoneIcon,
            onPress: () => handleCall(contact, phone, navigation),
          },
          {
            id: 'text',
            label: i18n.t('contactDetails.text'),
            icon: MessageCircleIcon,
            onPress: () => handleMessage(contact, phone, navigation),
          },
        ]
      : []),
    ...(address || contact.coordinate
      ? [
          {
            id: 'navigate',
            label: i18n.t('navigate'),
            icon: NavigationIcon,
            onPress: () => navigateTo(contact, defaultNavigationMapProvider),
          },
        ]
      : []),
  ]

  return (
    <ContactCard
      stripeColor={stripeColor}
      style={{
        paddingVertical: 0,
        paddingHorizontal: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
      }}
    >
      {}
      <Button
        onPress={onOpen}
        accessibilityRole='button'
        accessibilityLabel={contact.name}
        accessibilityHint={i18n.t('openContact')}
        style={{
          flex: 1,
          minWidth: 0,
          paddingVertical: 16,
          paddingLeft: 18,
          paddingRight: actions.length ? 8 : 18,
        }}
      >
        <ContactCardBody
          contact={contact}
          subtitle={
            address ? (
              <ContactCardSubtitle>{address}</ContactCardSubtitle>
            ) : null
          }
          trailing={
            actions.length ? null : (
              <LucideIcon
                icon={ChevronForwardIcon}
                size={16}
                color={theme.colors.textAlt}
              />
            )
          }
        />
      </Button>
      {actions.length ? (
        <View style={{ flexDirection: 'row', gap: 8, marginRight: 14 }}>
          {actions.map((action) => (
            <PointerTooltip key={action.id} label={action.label} effect='none'>
              <Button
                onPress={action.onPress}
                accessibilityRole='button'
                accessibilityLabel={action.label}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.accentTranslucent,
                }}
              >
                <LucideIcon
                  icon={action.icon}
                  size={16}
                  color={theme.colors.accent}
                />
              </Button>
            </PointerTooltip>
          ))}
        </View>
      ) : null}
    </ContactCard>
  )
}
