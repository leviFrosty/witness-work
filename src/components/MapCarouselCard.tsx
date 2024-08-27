import { View } from 'react-native'
import useTheme from '../contexts/theme'
import useConversations from '../stores/conversationStore'
import moment from 'moment'
import { useMemo } from 'react'
import Text from './MyText'
import { ContactMarker } from '../screens/MapScreen'
import { getMostRecentConversationForContact } from '../lib/contacts'
import i18n from '../lib/locales'
import Button from './Button'
import IconButton from './IconButton'
import {
  faArrowUpFromBracket,
  faDiamondTurnRight,
  faMessage,
  faPhone,
} from '@fortawesome/free-solid-svg-icons'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import { addressToString, coordinateAsString, navigateTo } from '../lib/address'
import Copyeable from './Copyeable'
import links from '../constants/links'
import { MapShareSheet } from './ShareAddressSheet'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { getLocales } from 'expo-localization'
import { handleCall, handleMessage } from '../lib/phone'
import { usePreferences } from '../stores/preferences'

interface Props {
  contact: ContactMarker
  setSheet: React.Dispatch<React.SetStateAction<MapShareSheet>>
}

const MapCarouselCard = ({ contact, setSheet }: Props) => {
  const { conversations } = useConversations()
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const locales = getLocales()
  const { defaultNavigationMapProvider } = usePreferences()

  const formatted = parsePhoneNumber(contact.phone || '', {
    regionCode: contact.phoneRegionCode || locales[0].regionCode || '',
  })

  const mostRecentConversation = useMemo(
    () => getMostRecentConversationForContact({ contact, conversations }),
    [contact, conversations]
  )

  if (!contact.address) {
    return null
  }

  const address = addressToString(contact.address)
  const coord = coordinateAsString(contact)

  const mostRecentDate = mostRecentConversation
    ? moment(mostRecentConversation.date)
    : null

  const addressUriEncoded = encodeURI(
    contact.userDraggedCoordinate ? coord : address
  )
  const appleMapsLink = `${links.appleMapsBase}/?q=${addressUriEncoded}`
  const googleMapsLink = `${links.googleMapsBase}${addressUriEncoded}`

  return (
    <Button
      onPress={() => navigation.navigate('Contact Details', { id: contact.id })}
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.numbers.borderRadiusLg,
        padding: 15,
        gap: 5,
        flex: 1,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
          }}
        >
          {contact.name}
        </Text>
        <Button
          onPress={() =>
            setSheet({
              open: true,
              appleMapsUri: appleMapsLink,
              googleMapsUri: googleMapsLink,
            })
          }
          style={{
            backgroundColor: theme.colors.background,
            padding: 10,
            borderRadius: theme.numbers.borderRadiusMd,
          }}
        >
          <IconButton
            icon={faArrowUpFromBracket}
            iconStyle={{ color: theme.colors.textAlt }}
          />
        </Button>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          flexGrow: 1,
        }}
      >
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 100,
            backgroundColor: contact.pinColor,
          }}
        />
        <Text>
          {mostRecentDate
            ? mostRecentDate.fromNow()
            : i18n.t('noConversationYet')}
        </Text>
      </View>
      <Copyeable text={address}>
        <Text
          style={{
            color: theme.colors.textAlt,
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
          gap: 5,
          marginTop: 10,
        }}
      >
        <Button
          onPress={() => navigateTo(contact, defaultNavigationMapProvider)}
          style={{
            paddingHorizontal: 20,
            paddingVertical: 20,
            flexGrow: 1,
            gap: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent,
            borderRadius: theme.numbers.borderRadiusMd,
          }}
        >
          <IconButton
            icon={faDiamondTurnRight}
            size='xl'
            iconStyle={{
              color: theme.colors.textInverse,
            }}
          />
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('navigate')}
          </Text>
        </Button>
        {contact.phone && (
          <Button
            onPress={() => handleCall(contact, formatted, navigation)}
            variant='outline'
            style={{ gap: 10, paddingHorizontal: 20 }}
          >
            <IconButton icon={faPhone} />
          </Button>
        )}
        {contact.phone && (
          <Button
            onPress={() => handleMessage(contact, formatted, navigation)}
            variant='outline'
            style={{ gap: 10, paddingHorizontal: 20 }}
          >
            <IconButton icon={faMessage} />
          </Button>
        )}
      </View>
    </Button>
  )
}

export default MapCarouselCard
