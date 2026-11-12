import {
  MessageSquareText as MessageSquareTextIcon,
  Navigation as NavigationIcon,
  Phone as PhoneIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { getLocales } from 'expo-localization'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize, {
  FIT_ONE_LINE,
} from '@/hooks/useAccessibilityTextSize'
import { addressToString, navigateTo } from '@/lib/address'
import i18n from '@/lib/locales'
import { handleCall, handleMessage } from '@/lib/phone'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'
import type { RootStackNavigation } from '@/types/rootStack'
import DetailsCard from '@/features/visits/components/DetailsCard'

const PAD = 16

export default function VisitDetailsContact({
  contact,
  onOpen,
}: {
  contact: Contact
  onOpen: () => void
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const largeText = useAccessibilityTextSize()
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
            icon: MessageSquareTextIcon,
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
    <DetailsCard
      style={{ paddingVertical: PAD, paddingHorizontal: PAD, gap: 12 }}
    >
      <Button
        onPress={onOpen}
        testID='visit-details-contact'
        accessibilityRole='button'
        accessibilityLabel={[contact.name, address].filter(Boolean).join(', ')}
        accessibilityHint={i18n.t('openContact')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: MIN_TOUCH_TARGET,
          paddingHorizontal: 2,
        }}
      >
        <Avatar
          avatar={contact.avatar ?? { type: 'none', value: '' }}
          name={contact.name}
          size={44}
          background={contact.avatarBackground ?? undefined}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            numberOfLines={largeText ? undefined : 1}
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {contact.name}
          </Text>
          {address ? (
            <Text
              numberOfLines={largeText ? 3 : 2}
              style={{
                fontSize: theme.fontSize('sm') + 1,
                color: theme.colors.textAlt,
              }}
            >
              {address}
            </Text>
          ) : null}
        </View>
        <LucideIcon
          icon={ChevronForwardIcon}
          size={18}
          color={theme.colors.textAlt}
        />
      </Button>
      {actions.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {actions.map((action) => (
            <Button
              key={action.id}
              onPress={action.onPress}
              testID={`visit-details-${action.id}`}
              accessibilityRole='button'
              accessibilityLabel={action.label}
              style={{
                flex: 1,
                alignItems: 'center',
                gap: 4,
                paddingTop: 10,
                paddingBottom: 8,
                borderRadius: theme.numbers.borderRadiusLg - PAD,
                backgroundColor: theme.colors.backgroundLighter,
              }}
            >
              <LucideIcon
                icon={action.icon}
                size={18}
                color={theme.colors.text}
              />
              <Text
                numberOfLines={1}
                {...(largeText ? FIT_ONE_LINE : undefined)}
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
    </DetailsCard>
  )
}
