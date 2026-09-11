import {
  MessageCircle as MessageCircleIcon,
  Phone as PhoneIcon,
  Route as RouteIcon,
  Share as ShareIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import moment from 'moment'
import { formatRelative } from '@/lib/dates'
import Text from '@/components/ui/MyText'
import { ConversationIndex } from '@/lib/conversationIndex'
import i18n from '@/lib/locales'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import { useNavigation } from '@react-navigation/native'
import { addressToString, coordinateAsString, navigateTo } from '@/lib/address'
import Copyeable from '@/components/ui/Copyeable'
import Avatar from '@/components/ui/Avatar'
import links from '@/constants/links'
import { MapShareSheet } from '@/features/map/components/ShareAddressSheet'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { getLocales } from 'expo-localization'
import { handleCall, handleMessage } from '@/lib/phone'
import { usePreferences } from '@/stores/preferences'
import { RootStackNavigation } from '@/types/rootStack'
import { ContactMarker } from '@/features/map/types/map'

interface Props {
  inspector?: boolean
  contact: ContactMarker
  index: ConversationIndex
  setSheet: React.Dispatch<React.SetStateAction<MapShareSheet>>
}

const MapCarouselCard = ({
  contact,
  index,
  setSheet,
  inspector = false,
}: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const locales = getLocales()
  const { defaultNavigationMapProvider } = usePreferences()

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

  // Fall back to coord when no address — covers pin-dragged contacts and legacy
  // coords-only entries so the share link still resolves.
  const addressUriEncoded = encodeURI(
    contact.userDraggedCoordinate || !address ? coord : address
  )
  const appleMapsLink = `${links.appleMapsBase}/?q=${addressUriEncoded}`
  const googleMapsLink = `${links.googleMapsBase}${addressUriEncoded}`

  return (
    <Button
      noTransform
      onPress={() => navigation.navigate('Contact Details', { id: contact.id })}
      variant='glass'
      style={{
        borderRadius: theme.numbers.borderRadiusLg,
        borderCurve: 'continuous',
        borderWidth: 0,
        flexDirection: 'column',
        alignItems: 'stretch',
        padding: 12,
        gap: 4,
        flex: inspector ? undefined : 1,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
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
      <Copyeable text={address}>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
          numberOfLines={2}
        >
          {address ? address : coord}
        </Text>
      </Copyeable>
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
        {contact.phone && (
          <Button
            noTransform
            hitSlop={0}
            accessibilityLabel={i18n.t('message')}
            onPress={() => handleMessage(contact, formatted, navigation)}
            variant='outline'
            style={{
              width: 44,
              height: 48,
              padding: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconButton icon={MessageCircleIcon} />
          </Button>
        )}
        <Button
          noTransform
          hitSlop={0}
          accessibilityLabel={i18n.t('share')}
          onPress={() =>
            setSheet({
              open: true,
              appleMapsUri: appleMapsLink,
              googleMapsUri: googleMapsLink,
            })
          }
          variant='outline'
          style={{
            width: 44,
            height: 48,
            padding: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconButton icon={ShareIcon} />
        </Button>
      </View>
    </Button>
  )
}

export default MapCarouselCard
