import {
  MessageCircle as MessageCircleIcon,
  Navigation as NavigationIcon,
  Phone as PhoneIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { getLocales } from 'expo-localization'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import { addressToString, navigateTo } from '@/lib/address'
import i18n from '@/lib/locales'
import { handleCall, handleMessage } from '@/lib/phone'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'
import type { RootStackNavigation } from '@/types/rootStack'

/**
 * Who the Visit was with: their photo, name, and address (opening Contact
 * Details), with Call, Text, and Navigate beside them.
 */
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Button
        onPress={onOpen}
        accessibilityRole='button'
        accessibilityLabel={contact.name}
        accessibilityHint={i18n.t('openContact')}
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Avatar
          avatar={contact.avatar ?? { type: 'none', value: '' }}
          name={contact.name}
          size={40}
          background={contact.avatarBackground ?? undefined}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: theme.fontSize('lg') + 1,
              fontFamily: theme.fonts.bold,
            }}
          >
            {contact.name}
          </Text>
          {address ? (
            <Text
              numberOfLines={1}
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {address}
            </Text>
          ) : null}
        </View>
      </Button>
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
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
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
  )
}
