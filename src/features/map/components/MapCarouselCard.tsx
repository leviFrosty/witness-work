import { Phone as PhoneIcon, Route as RouteIcon } from 'lucide-react-native'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import moment from 'moment'
import { formatRelative } from '@/lib/dates'
import Text from '@/components/ui/MyText'
import { ConversationIndex } from '@/lib/conversationIndex'
import i18n from '@/lib/locales'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import ContextMenu, {
  type ContextMenuEntries,
  type ContextMenuItem,
} from '@/components/ui/ContextMenu'
import ContactPreview from '@/components/ContactPreview'
import useContactMenuActions from '@/hooks/useContactMenuActions'
import { useNavigation } from '@react-navigation/native'
import { addressToString, coordinateAsString, navigateTo } from '@/lib/address'
import Avatar from '@/components/ui/Avatar'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { getLocales } from 'expo-localization'
import { handleCall } from '@/lib/phone'
import { shareUrl } from '@/lib/share'
import { usePreferences } from '@/stores/preferences'
import { RootStackNavigation } from '@/types/rootStack'
import { ContactMarker } from '@/features/map/types/map'
import MapCard from '@/features/map/components/MapCard'
import useCopyText from '@/features/map/hooks/useCopyText'
import { contactMapQuery, mapLinks } from '@/lib/mapLinks'

interface Props {
  inspector?: boolean
  contact: ContactMarker
  index: ConversationIndex
}

/** Adds items to the contact menu's second group (open, favorite, edit…). */
const withSecondaryItems = (
  entries: ContextMenuEntries,
  items: ContextMenuItem[]
): ContextMenuEntries => {
  const [first, second, ...rest] = entries
  if (!Array.isArray(second)) return [...entries, items]
  return [first, [...second, ...items], ...rest]
}

const MapCarouselCard = ({ contact, index, inspector = false }: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const locales = getLocales()
  const { defaultNavigationMapProvider } = usePreferences()
  const copyText = useCopyText()
  const contactActions = useContactMenuActions(contact)

  const formatted = parsePhoneNumber(contact.phone || '', {
    regionCode: contact.phoneRegionCode || locales[0].regionCode || '',
  })

  const mostRecentConversation =
    index.mostRecentConvByContact.get(contact.id) ?? null

  const address = addressToString(contact.address)
  const coord = coordinateAsString(contact)

  const mostRecentDate = mostRecentConversation
    ? moment(mostRecentConversation.date)
    : null

  const links = mapLinks(contactMapQuery(contact))

  const actions = withSecondaryItems(contactActions, [
    address
      ? {
          id: 'copy_address',
          title: i18n.t('copyAddress'),
          systemImage: 'doc.on.doc',
          onPress: () => void copyText(address),
        }
      : {
          id: 'copy_coordinates',
          title: i18n.t('copyCoordinates'),
          systemImage: 'doc.on.doc',
          onPress: () => void copyText(coord),
        },
    {
      id: 'share_map_link',
      title: i18n.t('shareMapLink'),
      systemImage: 'map',
      actions: [
        {
          id: 'apple',
          title: i18n.t('appleMaps'),
          onPress: () => void shareUrl(links.apple),
        },
        {
          id: 'google',
          title: i18n.t('googleMaps'),
          onPress: () => void shareUrl(links.google),
        },
      ],
    },
  ])

  return (
    <MapCard fill={!inspector}>
      <ContextMenu
        actions={actions}
        analyticsSurface='map_contact_card'
        onPress={() =>
          navigation.navigate('Contact Details', { id: contact.id })
        }
        preview={
          <ContactPreview
            contact={contact}
            lastVisit={mostRecentConversation}
          />
        }
      >
        <View style={{ gap: 4 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              flexShrink: 1,
            }}
          >
            <Avatar
              avatar={contact.avatar ?? { type: 'none', value: '' }}
              name={contact.name}
              size={36}
              background={contact.avatarBackground ?? undefined}
            />
            <Text
              numberOfLines={2}
              style={{
                fontSize: theme.fontSize('lg'),
                fontFamily: theme.fonts.bold,
                flexShrink: 1,
              }}
            >
              {contact.name}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 100,
                backgroundColor: contact.pinColor,
              }}
            />
            <Text style={{ fontSize: theme.fontSize('sm'), flexShrink: 1 }}>
              {mostRecentDate
                ? formatRelative(mostRecentDate)
                : i18n.t('noConversationYet')}
            </Text>
          </View>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
            numberOfLines={2}
          >
            {address ? address : coord}
          </Text>
        </View>
      </ContextMenu>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginTop: 8,
        }}
      >
        <Button
          noTransform
          hitSlop={0}
          onPress={() => navigateTo(contact, defaultNavigationMapProvider)}
          style={{
            paddingHorizontal: 10,
            minHeight: 48,
            flex: 1,
            gap: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent,
            borderRadius: theme.numbers.borderRadiusMd,
          }}
        >
          <IconButton
            icon={RouteIcon}
            size={18}
            iconStyle={{
              color: theme.colors.textInverse,
            }}
          />
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
              flexShrink: 1,
              textAlign: 'center',
            }}
          >
            {i18n.t('navigate')}
          </Text>
        </Button>
        {contact.phone && (
          <Button
            noTransform
            hitSlop={0}
            accessibilityLabel={i18n.t('call')}
            onPress={() => handleCall(contact, formatted, navigation)}
            variant='outline'
            style={{
              width: 44,
              height: 48,
              padding: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconButton icon={PhoneIcon} />
          </Button>
        )}
      </View>
    </MapCard>
  )
}

export default MapCarouselCard
