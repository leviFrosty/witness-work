import { useState } from 'react'
import { View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'

import Button from '@/components/ui/Button'
import ContextMenu from '@/components/ui/ContextMenu'
import Copyeable, {
  liftedContent,
  useCopyAction,
} from '@/components/ui/Copyeable'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { contactMapLinks } from '@/lib/mapLinks'
import useLocation from '@/features/contacts/hooks/useLocation'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import {
  addressToString,
  coordinateAsString,
  fetchCoordinateFromAddress,
  navigateTo,
} from '@/lib/address'
import { getContactStaleness, stalenessToColor } from '@/lib/contactStaleness'
import i18n from '@/lib/locales'
import { shareUrl } from '@/lib/share'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import type { Address, Contact } from '@/types/contact'

/**
 * Contact Details' address: tap navigates; long-press offers Navigate, Copy
 * Address, Copy Coordinates, and Share Map Link ▸ Apple Maps / Google Maps.
 * Below it, the coordinate (or a prompt to fetch one) and a small map.
 */
export default function ContactAddressRow({ contact }: { contact: Contact }) {
  const theme = useTheme()
  const [hasTriedToGetCoordinates, setHasTriedToGetCoordinates] =
    useState(false)
  const { address } = contact
  const updateContact = useContacts((s) => s.updateContact)
  const conversations = useConversations((s) => s.conversations)
  const {
    colorScheme,
    stalenessBreakpoints,
    incrementGeocodeApiCallCount,
    defaultNavigationMapProvider,
    // Fetching a coordinate posts the householder's address to HERE through
    // the vendor's proxy; in data protection mode the only coordinate a
    // contact can get is one the user drops by hand.
    dataProtectionMode,
  } = usePreferences()
  const colors = useMarkerColors()
  const { locationPermission } = useLocation()
  const copyAction = useCopyAction()

  const pinColor = stalenessToColor(
    getContactStaleness(contact, conversations, stalenessBreakpoints),
    colors
  )
  const addressString = addressToString(address)
  const hasCoordinate =
    contact.coordinate?.latitude !== undefined &&
    contact.coordinate?.longitude !== undefined
  const coordinateString = hasCoordinate ? coordinateAsString(contact) : ''
  const mapLinks = contactMapLinks(contact)
  const navigate = () => navigateTo(contact, defaultNavigationMapProvider)

  const attemptToGetCoordinates = async () => {
    setHasTriedToGetCoordinates(true)
    const position = await fetchCoordinateFromAddress(
      incrementGeocodeApiCallCount,
      contact.address
    )
    updateContact({
      ...contact,
      coordinate: position || undefined,
    })
  }

  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('address')}
      </Text>

      {!!addressString && (
        <ContextMenu
          style={liftedContent.outset}
          analyticsSurface='contact_address'
          onPress={navigate}
          accessibilityLabel={addressString}
          actions={[
            [
              {
                id: 'navigate',
                title: i18n.t('navigate'),
                systemImage: 'arrow.triangle.turn.up.right.diamond',
                onPress: navigate,
              },
              copyAction(addressString, {
                id: 'copy_address',
                title: i18n.t('copyAddress'),
              }),
              hasCoordinate &&
                copyAction(coordinateString, {
                  id: 'copy_coordinates',
                  title: i18n.t('copyCoordinates'),
                }),
            ],
            [
              mapLinks && {
                id: 'share_map_link',
                title: i18n.t('shareMapLink'),
                systemImage: 'square.and.arrow.up',
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
          ]}
        >
          <View
            style={[
              { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
              liftedContent.inset,
            ]}
          >
            {address &&
              Object.keys(address).map((key) =>
                address[key as keyof Address] ? (
                  <Text key={key}>{address[key as keyof Address]}</Text>
                ) : null
              )}
          </View>
        </ContextMenu>
      )}
      {!dataProtectionMode &&
      ((contact.coordinate && contact.coordinate.latitude === undefined) ||
        (contact.coordinate && contact.coordinate.longitude === undefined) ||
        (contact.coordinate === undefined &&
          hasTriedToGetCoordinates === false)) ? (
        <View style={{ gap: 3 }}>
          <Button onPress={attemptToGetCoordinates}>
            <Text
              style={{
                textDecorationLine: 'underline',
                color: theme.colors.accent,
              }}
            >
              {i18n.t('fetchCoordinates')}
            </Text>
          </Button>
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('coordinatesAllowMapView')}
          </Text>
        </View>
      ) : contact.coordinate ? (
        <>
          <Copyeable
            analyticsSurface='contact_coordinates'
            textProps={{
              style: {
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
              },
            }}
          >
            {coordinateAsString(contact)}
          </Copyeable>
          <MapView
            userInterfaceStyle={colorScheme ? colorScheme : undefined}
            showsUserLocation={locationPermission}
            initialRegion={{
              ...contact.coordinate,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }}
            style={{
              height: 180,
              width: '100%',
              borderRadius: theme.numbers.borderRadiusSm,
            }}
            onPress={navigate}
          >
            <Marker
              identifier={contact.id}
              // Include pinColor in the key so the marker remounts when its
              // staleness color changes. react-native-maps only applies
              // `pinColor` at mount on iOS — without the remount, logging a
              // conversation never updates the pin tint until reload.
              key={`${contact.id}-${pinColor}`}
              coordinate={contact.coordinate}
              pinColor={pinColor}
              draggable
              onDragEnd={(e) =>
                updateContact({
                  ...contact,
                  coordinate: e.nativeEvent.coordinate,
                  userDraggedCoordinate: true,
                })
              }
            />
          </MapView>
        </>
      ) : null}
    </View>
  )
}
