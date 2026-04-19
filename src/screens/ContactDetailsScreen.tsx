import { View, ScrollView, useColorScheme, Share, Alert } from 'react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Text from '../components/MyText'
import useTheme from '../contexts/theme'
import {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack'
import useContacts from '../stores/contactsStore'
import Header from '../components/layout/Header'
import CardWithTitle from '../components/CardWithTitle'
import { Address, Contact } from '../types/contact'
import { FlashList } from '@shopify/flash-list'
import ConversationRow from '../components/ConversationRow'
import useConversations from '../stores/conversationStore'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Divider from '../components/Divider'
import moment from 'moment'
import i18n from '../lib/locales'
import {
  contactHasAtLeastOneStudy,
  contactMostRecentStudy,
  contactStudiedForGivenMonth,
} from '../lib/conversations'
import { Conversation } from '../types/conversation'
import Wrapper from '../components/layout/Wrapper'
import { StatusBar } from 'expo-status-bar'
import IconButton from '../components/IconButton'
import { logger } from '../lib/logger'
import {
  faArrowUpFromBracket,
  faBook,
  faCaravan,
  faComment,
  faComments,
  faEllipsisVertical,
  faEnvelope,
  faPhone,
  faPlus,
  faStar,
} from '@fortawesome/free-solid-svg-icons'
import { faStar as faStarOutline } from '@fortawesome/free-regular-svg-icons'
import Copyeable from '../components/Copyeable'
import Button from '../components/Button'
import { Sheet } from 'tamagui'
import {
  addressToString,
  coordinateAsString,
  fetchCoordinateFromAddress,
  navigateTo,
} from '../lib/address'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { getLocales } from 'expo-localization'
import { useNavigation } from '@react-navigation/native'
import { usePreferences } from '../stores/preferences'
import { handleCall, handleMessage } from '../lib/phone'
import { openURL } from '../lib/links'
import MapView, { Marker } from 'react-native-maps'
import useLocation from '../hooks/useLocation'
import * as FileSystem from 'expo-file-system/legacy'
import { useToastController } from '@tamagui/toast'
import XView from '../components/layout/XView'
import { RootStackNavigation, RootStackParamList } from '../types/rootStack'
import { useMarkerColors } from '../hooks/useMarkerColors'
import { getContactStaleness, stalenessToColor } from '../lib/contactStaleness'
import DismissContactSheet from '../components/DismissContactSheet'
import Card from '../components/Card'
import { buildContactShareLink } from '../lib/contactShareLink'
import { MenuView, MenuAction } from '@react-native-menu/menu'
import { isContactDismissed } from '../lib/dismissedContacts'
import Avatar from '../components/Avatar'
import { ProfileAvatar } from '../stores/preferences'

type Props = NativeStackScreenProps<RootStackParamList, 'Contact Details'>

type ContactExport = {
  version: '1.0'
  type: 'witnesswork-contact'
  exportedAt: string
  contact: Contact
  conversations?: Conversation[]
}

const PhoneRow = ({ contact }: { contact: Contact }) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const locales = getLocales()

  const formatted = parsePhoneNumber(contact.phone || '', {
    regionCode: contact.phoneRegionCode || locales[0].regionCode || '',
  })
  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('phone')}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <Copyeable
          textProps={{
            onPress: () => handleCall(contact, formatted, navigation),
          }}
        >
          {formatted.number?.international}
        </Copyeable>
        <View
          style={{
            flexDirection: 'row',
            gap: 25,
            alignItems: 'center',
          }}
        >
          <IconButton
            icon={faPhone}
            size='lg'
            iconStyle={{ color: theme.colors.accent }}
            onPress={() => handleCall(contact, formatted, navigation)}
          />
          <IconButton
            icon={faComment}
            size='lg'
            iconStyle={{ color: theme.colors.accent }}
            onPress={() => handleMessage(contact, formatted, navigation)}
          />
        </View>
      </View>
    </View>
  )
}

const Hero = ({
  name,
  avatar,
  isBibleStudy: isActiveBibleStudy,
  hasStudiedPreviously,
  mostRecentStudy,
}: {
  name: string
  avatar: ProfileAvatar
  isBibleStudy?: boolean
  hasStudiedPreviously?: boolean
  mostRecentStudy: Conversation | null
}) => {
  const theme = useTheme()

  return (
    <View
      style={{
        paddingTop: 80,
        paddingBottom: 24,
        gap: 12,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.accent3,
      }}
    >
      <Avatar avatar={avatar} name={name} size={134} focusable />
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textInverse,
        }}
      >
        {i18n.t('contact')}
      </Text>
      <Copyeable
        textProps={{
          style: {
            fontSize: 40,
            fontFamily: theme.fonts.bold,
            color: theme.colors.textInverse,
            textAlign: 'center',
          },
        }}
      >
        {name}
      </Copyeable>
      {hasStudiedPreviously && mostRecentStudy && (
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 16,
              fontFamily: theme.fonts.regular,
              color: theme.colors.textInverse,
            }}
          >
            {isActiveBibleStudy
              ? i18n.t('isStudying')
              : `${i18n.t('lastStudied')} ${moment(mostRecentStudy.date).format(
                  'L'
                )}`}
          </Text>
          <IconButton
            icon={faBook}
            iconStyle={{ color: theme.colors.textInverse }}
          />
        </View>
      )}
      {!isActiveBibleStudy && hasStudiedPreviously && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textInverse,
            maxWidth: 250,
          }}
        >
          {i18n.t('inactiveBibleStudiesDoNoCountTowardsMonthlyTotals')}
        </Text>
      )}
    </View>
  )
}

const AddressRow = ({ contact }: { contact: Contact }) => {
  const theme = useTheme()
  const [hasTriedToGetCoordinates, setHasTriedToGetCoordinates] =
    useState(false)
  const { address } = contact
  const { updateContact } = useContacts()
  const { colorScheme } = usePreferences()
  const { conversations } = useConversations()
  const { incrementGeocodeApiCallCount, defaultNavigationMapProvider } =
    usePreferences()
  const mapRef = useRef<MapView>(null)
  const colors = useMarkerColors()
  const { locationPermission } = useLocation()

  const fitToMarkers = useCallback(() => {
    setTimeout(() => {
      if (!contact.coordinate) {
        return
      }
      mapRef.current?.fitToSuppliedMarkers([contact.id])
    }, 0)
  }, [contact.coordinate, contact.id])

  const pinColor = useMemo(
    () =>
      stalenessToColor(getContactStaleness(contact!, conversations), colors),
    [colors, contact, conversations]
  )

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

      <Button onPress={() => navigateTo(contact, defaultNavigationMapProvider)}>
        <View
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Copyeable
            text={addressToString(address)}
            onPress={() => navigateTo(contact, defaultNavigationMapProvider)}
          >
            {address && (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 5,
                }}
              >
                {Object.keys(address).map((key) => {
                  if (address[key as keyof Address]) {
                    return (
                      <Text key={key}>{address[key as keyof Address]}</Text>
                    )
                  }
                })}
              </View>
            )}
          </Copyeable>
        </View>
      </Button>
      {(contact.coordinate && contact.coordinate.latitude === undefined) ||
      (contact.coordinate && contact.coordinate.longitude === undefined) ||
      (contact.coordinate === undefined &&
        hasTriedToGetCoordinates === false) ? (
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
      ) : contact.coordinate?.latitude && contact.coordinate?.longitude ? (
        <>
          <Copyeable text={coordinateAsString(contact)}>
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
              }}
            >
              {coordinateAsString(contact)}
            </Text>
          </Copyeable>
          <MapView
            userInterfaceStyle={colorScheme ? colorScheme : undefined}
            showsUserLocation={locationPermission}
            ref={mapRef}
            onLayout={fitToMarkers}
            style={{
              height: 180,
              width: '100%',
              borderRadius: theme.numbers.borderRadiusSm,
            }}
            onPress={() => navigateTo(contact, defaultNavigationMapProvider)}
          >
            <Marker
              identifier={contact.id}
              key={contact.id}
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

const CustomFieldsRow = (props: { contact: Contact }) => {
  const theme = useTheme()
  const { customFields } = props.contact

  if (!customFields) {
    return null
  }

  return Object.keys(customFields).map((key) => (
    <View style={{ gap: 10 }} key={key}>
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {key}
      </Text>
      <Copyeable>{customFields[key]}</Copyeable>
    </View>
  ))
}

const EmailRow = ({ contact }: { contact: Contact }) => {
  const theme = useTheme()
  const { email } = contact
  if (!email) {
    return null
  }

  const openMail = async () => {
    openURL(`mailTo:${email}`, {
      alert: {
        description: i18n.t('failedToOpenMailApplication'),
      },
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
        {i18n.t('email')}
      </Text>
      <Button onPress={openMail}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Copyeable>{email}</Copyeable>
          </View>
          <IconButton
            size='lg'
            iconStyle={{ color: theme.colors.accent }}
            icon={faEnvelope}
          />
        </View>
      </Button>
    </View>
  )
}

const CreatedAt = ({ contact }: { contact: Contact }) => {
  const theme = useTheme()

  return (
    <View style={{ gap: 5 }}>
      <Text
        style={{
          fontSize: 10,
          color: theme.colors.textAlt,
          textAlign: 'center',
        }}
      >
        {i18n.t('created')} {moment(contact.createdAt).format('LL')}
      </Text>
    </View>
  )
}

interface AddSheetProps {
  sheetOpen: boolean
  setSheetOpen: React.Dispatch<React.SetStateAction<boolean>>
  navigation: NativeStackNavigationProp<
    RootStackParamList,
    'Contact Details',
    undefined
  >
  contact: Contact
}

const AddSheet = ({
  sheetOpen,
  setSheetOpen,
  navigation,
  contact,
}: AddSheetProps) => {
  const theme = useTheme()

  const handleAction = (action: 'notAtHome' | 'conversation') => {
    if (action === 'notAtHome') {
      navigation.replace('Conversation Form', {
        contactId: contact?.id,
        notAtHome: true,
      })
    }
    if (action === 'conversation') {
      navigation.replace('Conversation Form', {
        contactId: contact?.id,
      })
    }

    setSheetOpen(false)
  }

  return (
    <Sheet
      open={sheetOpen}
      onOpenChange={setSheetOpen}
      dismissOnSnapToBottom
      snapPoints={[55]}
      modal
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View style={{ gap: 15, padding: 30 }}>
          <View style={{ gap: 10 }}>
            <Text
              style={{
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.bold,
                color: theme.colors.text,
              }}
            >
              {i18n.t('addToHistory')}
            </Text>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                marginBottom: 15,
                color: theme.colors.text,
              }}
            >
              {i18n.t('add_description')}
            </Text>
          </View>
          <Button
            style={{ gap: 10 }}
            variant='outline'
            onPress={async () => handleAction('notAtHome')}
          >
            <IconButton
              iconStyle={{ color: theme.colors.text }}
              icon={faCaravan}
            />
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize('md'),
              }}
            >
              {i18n.t('notAtHome')}
            </Text>
          </Button>
          <Button
            style={{ gap: 10, backgroundColor: theme.colors.accent }}
            variant='solid'
            onPress={async () => handleAction('conversation')}
          >
            <IconButton
              icon={faComments}
              iconStyle={{
                color: theme.colors.textInverse,
              }}
            />
            <Text
              style={{
                color: theme.colors.textInverse,
                fontSize: theme.fontSize('md'),
              }}
            >
              {i18n.t('conversation')}
            </Text>
          </Button>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

const ContactDetailsScreen = ({ route, navigation }: Props) => {
  const colorScheme = useColorScheme()
  const theme = useTheme()
  const { developerTools } = usePreferences()
  const { params } = route
  const insets = useSafeAreaInsets()
  const { contacts, deleteContact, toggleFavoriteContact } = useContacts()
  const contact = useMemo(
    () => contacts.find((c) => c.id === params.id),
    [contacts, params.id]
  )
  const toast = useToastController()
  const { conversations } = useConversations()

  const highlightedConversation = useMemo(
    () => conversations.find((c) => c.id === params.highlightedConversationId),
    [conversations, params.highlightedConversationId]
  )

  const scrollViewRef = useRef<ScrollView>(null)
  const highlightedRowRef = useRef<View>(null)

  // When opened via the widget deep link
  // (`witnesswork://contact/:id/:convId`), scroll the highlighted row into
  // view so the user can immediately see which conversation the widget was
  // pointing at. Delayed slightly so the FlashList has time to lay out.
  useEffect(() => {
    if (!params.highlightedConversationId || !highlightedConversation) return
    const timer = setTimeout(() => {
      const sv = scrollViewRef.current
      const row = highlightedRowRef.current
      if (!sv || !row) return
      row.measureLayout(
        // @ts-expect-error — RN accepts a host component ref here.
        sv,
        (_x, y) => {
          sv.scrollTo({ y: Math.max(0, y - 100), animated: true })
        },
        () => {}
      )
    }, 450)
    return () => clearTimeout(timer)
  }, [params.highlightedConversationId, highlightedConversation])

  const contactConversations = useMemo(
    () => conversations.filter(({ contact: { id } }) => id === contact?.id),
    [contact?.id, conversations]
  )

  const contactConversationsSorted = useMemo(
    () =>
      contactConversations.sort((a, b) =>
        moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
      ),
    [contactConversations]
  )

  const [sheetOpen, setSheetOpen] = useState(false)
  const [dismissSheetOpen, setDismissSheetOpen] = useState(false)

  const contactMenuActions = useMemo<MenuAction[]>(() => {
    const actions: MenuAction[] = [
      { id: 'edit', title: i18n.t('edit'), image: 'pencil' },
    ]
    if (contact && !isContactDismissed(contact)) {
      actions.push({ id: 'dismiss', title: i18n.t('dismiss'), image: 'clock' })
    }
    actions.push({
      id: 'delete',
      title: i18n.t('delete'),
      image: 'trash',
      attributes: { destructive: true },
    })
    return actions
  }, [contact])

  const handleContactMenuAction = useCallback(
    (action: string) => {
      if (!contact) return
      switch (action) {
        case 'edit':
          navigation.replace('Contact Form', { id: contact.id, edit: true })
          break
        case 'dismiss':
          setDismissSheetOpen(true)
          break
        case 'delete':
          Alert.alert(
            i18n.t('archiveContact_question'),
            i18n.t('archiveContact_description'),
            [
              { text: i18n.t('cancel'), style: 'cancel' },
              {
                text: i18n.t('delete'),
                style: 'destructive',
                onPress: () => {
                  deleteContact(contact.id)
                  toast.show(i18n.t('success'), {
                    message: i18n.t('archived'),
                    native: true,
                  })
                  navigation.popToTop()
                },
              },
            ]
          )
          break
      }
    },
    [contact, deleteContact, navigation, toast]
  )

  const handleExportContact = useCallback(async () => {
    if (!contact) return

    // Primary path: share a universal link. Tapping it on a device with the
    // app installed opens straight into the Contact Details screen; iOS
    // without the app falls through to the ww-proxy fallback HTML (App Store
    // CTA). Google-Maps-style "tap the bubble, open the app".
    try {
      const { url, includedConversations, trimmed } = buildContactShareLink(
        contact,
        contactConversations
      )
      logger.log('[ContactShareLink] generated url =', url)
      logger.log('[ContactShareLink] length =', url.length, 'bytes')
      // Pass the URL as `url` (not embedded in `message`) so iOS fetches
      // Open Graph metadata from the ww-proxy fallback page and renders a
      // rich link preview in the share sheet + iMessage bubble. Passing
      // both fields causes some targets to duplicate the URL.
      await Share.share({
        url,
        title: i18n.t('exportContact'),
      })
      if (trimmed) {
        toast.show(i18n.t('shareContact'), {
          message: i18n.t('shareContactTrimmed', {
            included: includedConversations,
            total: contactConversations.length,
          }),
          native: true,
        })
      }
      return
    } catch (error) {
      // Fall through to file-export path for contacts too large to fit in a
      // URL even with zero conversations (pathological custom fields, etc.).
      logger.error('Falling back to file export:', error)
    }

    // Drop per-device image avatar URIs — same policy as the universal-link
    // share (see contactShareLink.ts CONTACT_POLICY.avatar). The file path
    // points inside this device's FileSystem.documentDirectory and would be
    // dead on the recipient's device.
    let exportContact: Contact = contact
    if (contact.avatar?.type === 'image') {
      exportContact = { ...contact }
      delete exportContact.avatar
    }

    const exportData: ContactExport = {
      version: '1.0',
      type: 'witnesswork-contact',
      exportedAt: moment().toISOString(),
      contact: exportContact,
    }

    if (contactConversations.length > 0) {
      exportData.conversations = contactConversations.sort((a, b) =>
        moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
      )
    }

    const jsonString = JSON.stringify(exportData, null, 2)
    const sanitizedName = contact.name.replace(/[^a-zA-Z0-9]/g, '_')
    const timestamp = moment().format('YYYY-MM-DD')
    const fileName = `${sanitizedName}_${timestamp}.witnesswork`
    // Cache dir (not document dir): iOS share-sheet attachments are passed by
    // reference, so we can't delete the file immediately after `Share.share`
    // resolves without blanking the iMessage attachment. Cache is purged by
    // the OS when needed.
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`

    try {
      await FileSystem.writeAsStringAsync(fileUri, jsonString)
      await Share.share({
        url: fileUri,
        title: i18n.t('exportContact'),
      })
    } catch (error) {
      logger.error('Error sharing contact:', error)
      // Last resort: share the JSON as message text.
      await Share.share({ message: jsonString })
    }
  }, [contact, contactConversations, toast])

  useEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          inverseTextAndIconColor
          noBottomBorder
          title=''
          buttonType='back'
          rightElement={
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 20,
                position: 'absolute',
                right: 0,
              }}
            >
              <MenuView
                actions={contactMenuActions}
                onPressAction={({ nativeEvent }) =>
                  handleContactMenuAction(nativeEvent.event)
                }
              >
                <IconButton
                  icon={faEllipsisVertical}
                  color={theme.colors.textInverse}
                />
              </MenuView>

              <IconButton
                icon={contact?.isFavorite ? faStar : faStarOutline}
                color={theme.colors.textInverse}
                onPress={() => {
                  if (contact) {
                    toggleFavoriteContact(contact.id)
                  }
                }}
              />

              <IconButton
                icon={faArrowUpFromBracket}
                color={theme.colors.textInverse}
                onPress={handleExportContact}
              />

              <Button onPress={() => setSheetOpen(true)}>
                <XView
                  style={{
                    borderColor: theme.colors.textInverse,
                    borderWidth: 1,
                    paddingVertical: 5,
                    paddingHorizontal: 10,
                    borderRadius: theme.numbers.borderRadiusSm,
                  }}
                >
                  <IconButton
                    iconStyle={{ color: theme.colors.textInverse }}
                    icon={faPlus}
                  />
                  <Text style={{ color: theme.colors.textInverse }}>
                    {i18n.t('add')}
                  </Text>
                </XView>
              </Button>
            </View>
          }
          backgroundColor={theme.colors.accent3}
        />
      ),
    })
  }, [
    contact,
    contact?.id,
    contact?.isFavorite,
    contactMenuActions,
    handleContactMenuAction,
    handleExportContact,
    navigation,
    params.id,
    theme.colors.accent3,
    theme.colors.textInverse,
    theme.numbers.borderRadiusSm,
    toggleFavoriteContact,
  ])

  const isActiveBibleStudy = useMemo(
    () =>
      contact
        ? contactStudiedForGivenMonth({
            contact,
            conversations,
            month: new Date(),
          })
        : false,
    [contact, conversations]
  )

  const hasStudiedPreviously = useMemo(
    () =>
      contact
        ? contactHasAtLeastOneStudy({
            conversations,
            contact,
          })
        : false,
    [contact, conversations]
  )

  const mostRecentStudy = useMemo(
    () => (contact ? contactMostRecentStudy({ conversations, contact }) : null),
    [contact, conversations]
  )

  if (!contact) {
    return (
      <Wrapper style={{ flexGrow: 1, padding: 10 }}>
        <Text style={{ fontSize: 18, marginTop: 15 }}>
          {i18n.t('contactNotFoundForProvidedId')} {params.id}
        </Text>
      </Wrapper>
    )
  }

  const { name, address, phone, email, customFields, coordinate } = contact

  const hasAddress =
    address && Object.values(address).some((v) => v?.length > 0)
  const hasCustomFields =
    customFields !== undefined &&
    Object.values(customFields).some((f) => !!f.length)

  return (
    <View style={{ flexGrow: 1 }}>
      <ScrollView
        ref={scrollViewRef}
        style={{
          position: 'relative',
          paddingTop: 100,
          marginTop: -100,
          backgroundColor: theme.colors.background,
        }}
      >
        <StatusBar style={colorScheme === 'light' ? 'light' : 'dark'} />

        <Wrapper
          insets='none'
          style={{
            marginBottom: insets.bottom + 125,
            flexGrow: 1,
            flex: 1,
          }}
        >
          <Hero
            isBibleStudy={isActiveBibleStudy}
            hasStudiedPreviously={hasStudiedPreviously}
            mostRecentStudy={mostRecentStudy}
            name={name}
            avatar={contact.avatar ?? { type: 'none', value: '' }}
          />
          {developerTools && (
            <Card style={{ marginHorizontal: 10 }}>
              <Text>{JSON.stringify(contact, null, 2)}</Text>
            </Card>
          )}
          <View style={{ gap: 30 }}>
            <CardWithTitle
              titlePosition='inside'
              title='Details'
              style={{ margin: 20 }}
            >
              <View style={{ gap: 15 }}>
                {(hasAddress || coordinate) && <AddressRow contact={contact} />}
                {phone && <PhoneRow contact={contact} />}
                {email && <EmailRow contact={contact} />}
                {hasCustomFields && <CustomFieldsRow contact={contact} />}
                {!hasAddress && !phone && !email && !hasCustomFields && (
                  <Text>{i18n.t('noPersonalInformationSaved')}</Text>
                )}
              </View>
            </CardWithTitle>
            <View style={{ gap: 10 }}>
              <XView
                style={{
                  justifyContent: 'space-between',
                  paddingHorizontal: 15,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.text,
                  }}
                >
                  {i18n.t('conversationHistory')}
                </Text>
                <Button onPress={() => setSheetOpen(true)}>
                  <XView
                    style={{
                      borderColor: theme.colors.text,
                      borderWidth: 1,
                      paddingVertical: 5,
                      paddingHorizontal: 10,
                      borderRadius: theme.numbers.borderRadiusSm,
                    }}
                  >
                    <IconButton
                      iconStyle={{ color: theme.colors.text }}
                      icon={faPlus}
                      size={'sm'}
                    />
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontSize: theme.fontSize('sm'),
                      }}
                    >
                      {i18n.t('add')}
                    </Text>
                  </XView>
                </Button>
              </XView>
              <View style={{ minHeight: 2 }}>
                <FlashList
                  scrollEnabled={false}
                  renderItem={({ item }) => {
                    const isHighlighted =
                      item.id === highlightedConversation?.id
                    return (
                      <View ref={isHighlighted ? highlightedRowRef : undefined}>
                        <ConversationRow
                          conversation={item}
                          highlighted={isHighlighted}
                        />
                      </View>
                    )
                  }}
                  ItemSeparatorComponent={() => <Divider borderWidth={2} />}
                  data={contactConversationsSorted}
                  ListEmptyComponent={
                    <View
                      style={{
                        backgroundColor: theme.colors.backgroundLighter,
                        paddingVertical: 30,
                        paddingHorizontal: 20,
                      }}
                    >
                      <Button>
                        <Text>{i18n.t('thisContactHasNoConversations')}</Text>
                      </Button>
                    </View>
                  }
                />
              </View>
            </View>
            <CreatedAt contact={contact} />
          </View>
          <View
            style={{
              position: 'absolute',
              height: 360,
              width: '100%',
              zIndex: -100,
              backgroundColor: theme.colors.accent3,
            }}
          />
          <View
            style={{
              backgroundColor: theme.colors.accent3,
              height: 1000,
              position: 'absolute',
              top: -1000,
              left: 0,
              right: 0,
            }}
          />
        </Wrapper>
      </ScrollView>
      <AddSheet
        contact={contact}
        navigation={navigation}
        setSheetOpen={setSheetOpen}
        sheetOpen={sheetOpen}
      />
      <DismissContactSheet
        open={dismissSheetOpen}
        setOpen={setDismissSheetOpen}
        contact={contact}
      />
    </View>
  )
}

export default ContactDetailsScreen
