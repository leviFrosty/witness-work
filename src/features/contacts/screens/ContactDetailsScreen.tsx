import {
  View,
  ScrollView,
  useColorScheme,
  Share,
  Alert,
  Pressable,
} from 'react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack'
import useContacts from '@/stores/contactsStore'
import Header from '@/components/ui/layout/Header'
import CardWithTitle from '@/components/CardWithTitle'
import { Address, Contact } from '@/types/contact'
import { FlashList } from '@shopify/flash-list'
import ConversationRow from '@/features/contacts/components/ConversationRow'
import useConversations from '@/stores/conversationStore'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Divider from '@/components/ui/Divider'
import moment from 'moment'
import i18n from '@/lib/locales'
import {
  contactHasAtLeastOneStudy,
  contactMostRecentStudy,
  contactStudiedForGivenMonth,
} from '@/lib/conversations'
import { Conversation } from '@/types/conversation'
import Wrapper from '@/components/ui/layout/Wrapper'
import { StatusBar } from 'expo-status-bar'
import IconButton from '@/components/ui/IconButton'
import { logger } from '@/lib/logger'
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
import Copyeable from '@/components/ui/Copyeable'
import Button from '@/components/ui/Button'
import { Sheet } from 'tamagui'
import {
  addressToString,
  coordinateAsString,
  fetchCoordinateFromAddress,
  navigateTo,
} from '@/lib/address'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { getLocales } from 'expo-localization'
import { useNavigation } from '@react-navigation/native'
import { usePreferences } from '@/stores/preferences'
import { handleCall, handleMessage } from '@/lib/phone'
import { openURL } from '@/lib/links'
import MapView, { Marker } from 'react-native-maps'
import useLocation from '@/features/contacts/hooks/useLocation'
import * as FileSystem from 'expo-file-system/legacy'
import { useToastController } from '@tamagui/toast'
import XView from '@/components/ui/layout/XView'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import { getContactStaleness, stalenessToColor } from '@/lib/contactStaleness'
import DismissContactSheet from '@/features/contacts/components/DismissContactSheet'
import {
  buildContactShareLink,
  ContactShareLinkTooLargeError,
} from '@/features/contacts/lib/contactShareLink'
import { MenuView, MenuAction } from '@react-native-menu/menu'
import { isContactDismissed } from '@/lib/dismissedContacts'
import Avatar, { isRenderableImageValue } from '@/components/ui/Avatar'
import GenderIcon from '@/components/GenderIcon'
import { ProfileAvatar } from '@/types/avatar'
import JsonViewer from '@/features/contacts/components/JsonViewer'
import ContactAvatarViewer from '@/features/contacts/components/ContactAvatarViewer'
import useContactHeroBackground from '@/features/contacts/hooks/useContactHeroBackground'

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
  contact,
  name,
  avatar,
  avatarBackground,
  heroBackground,
  isBibleStudy: isActiveBibleStudy,
  hasStudiedPreviously,
  mostRecentStudy,
}: {
  contact: Contact
  name: string
  avatar: ProfileAvatar
  avatarBackground?: string | null
  heroBackground: string
  isBibleStudy?: boolean
  hasStudiedPreviously?: boolean
  mostRecentStudy: Conversation | null
}) => {
  const theme = useTheme()
  const [viewerOpen, setViewerOpen] = useState(false)
  // Image avatars open the new full-screen viewer (pinch / pan / share / save
  // / edit / reset / info). Emoji and initials fallbacks keep the existing
  // morph-to-center animation from `Avatar`'s built-in `focusable` mode.
  // iCloud markers (`icloud://...`) report `type === 'image'` but aren't
  // renderable — they fall through to the morph experience until the binary
  // lands and the marker is rewritten to a `file://` URI.
  const isImageAvatar =
    avatar.type === 'image' && isRenderableImageValue(avatar.value)

  return (
    <View
      style={{
        paddingTop: 80,
        paddingBottom: 24,
        gap: 12,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: heroBackground,
      }}
    >
      <View
        style={{
          borderRadius: 67,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        {isImageAvatar ? (
          <Pressable
            onPress={() => setViewerOpen(true)}
            accessibilityRole='imagebutton'
            accessibilityLabel={i18n.t('profilePicture')}
            hitSlop={4}
          >
            <Avatar
              avatar={avatar}
              name={name}
              size={134}
              background={avatarBackground ?? undefined}
            />
          </Pressable>
        ) : (
          <Avatar
            avatar={avatar}
            name={name}
            size={134}
            focusable
            background={avatarBackground ?? undefined}
          />
        )}
      </View>
      {isImageAvatar && (
        <ContactAvatarViewer
          visible={viewerOpen}
          contact={contact}
          onClose={() => setViewerOpen(false)}
        />
      )}
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textInverse,
        }}
      >
        {i18n.t('contact')}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingHorizontal: 20,
        }}
      >
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
        {contact.gender && (
          <GenderIcon
            gender={contact.gender}
            size={22}
            color={theme.colors.textInverse}
            opacity={0.7}
          />
        )}
      </View>
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
  const customFieldDefs = useContacts((s) => s.customFieldDefs)

  if (!customFields) {
    return null
  }

  // Render in def.order, skip archived defs entirely (their values stay in
  // storage; restoring the def re-exposes them). Iterating defs (rather than
  // contact keys) also drops orphan ids from view — those exist only when a
  // def was hard-purged but the contact still references the id, which is
  // not reachable through the standard archive flow.
  const visible = [...customFieldDefs]
    .filter((d) => !d.archived && customFields[d.id])
    .sort((a, b) => a.order - b.order)

  if (visible.length === 0) return null

  return visible.map((def) => (
    <View style={{ gap: 10 }} key={def.id}>
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {def.label}
      </Text>
      <Copyeable>{customFields[def.id]}</Copyeable>
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
            noTransform
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
            noTransform
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
  const { contacts, deleteContact, toggleFavoriteContact, customFieldDefs } =
    useContacts()
  const contact = useMemo(
    () => contacts.find((c) => c.id === params.id),
    [contacts, params.id]
  )
  const toast = useToastController()
  const { conversations } = useConversations()
  const heroBackground = useContactHeroBackground(contact)

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
      {
        id: 'edit',
        title: i18n.t('edit'),
        image: 'pencil',
        imageColor: theme.colors.text,
      },
    ]
    if (contact && !isContactDismissed(contact)) {
      actions.push({
        id: 'dismiss',
        title: i18n.t('dismiss'),
        image: 'clock',
        imageColor: theme.colors.text,
      })
    }
    actions.push({
      id: 'delete',
      title: i18n.t('delete'),
      image: 'trash',
      imageColor: theme.colors.error,
      attributes: { destructive: true },
    })
    return actions
  }, [contact, theme.colors.text, theme.colors.error])

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

  const shareContactAsFile = useCallback(async () => {
    if (!contact) return
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
      logger.error('Error sharing contact file:', error)
      Alert.alert(
        i18n.t('shareContactFileFailed_title'),
        i18n.t('shareContactFileFailed_description')
      )
    }
  }, [contact, contactConversations])

  const handleExportContact = useCallback(async () => {
    if (!contact) return

    // Primary path: share a universal link. Tapping it on a device with the
    // app installed opens straight into the Contact Details screen; iOS
    // without the app falls through to the ww-proxy fallback HTML (App Store
    // CTA). Google-Maps-style "tap the bubble, open the app".
    try {
      const { url, includedConversations, trimmed } = buildContactShareLink(
        contact,
        contactConversations,
        customFieldDefs
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
      if (error instanceof ContactShareLinkTooLargeError) {
        // Surface the situation explicitly: file export only works for
        // recipients who already have the app, unlike the universal link
        // which falls back to an App Store CTA. The user needs to make that
        // tradeoff themselves rather than us silently degrading.
        logger.log(
          '[ContactShareLink] payload too large, prompting user',
          error.bareUrlBytes,
          '/',
          error.maxUrlBytes
        )
        Alert.alert(
          i18n.t('shareContactTooLarge_title'),
          i18n.t('shareContactTooLarge_description'),
          [
            { text: i18n.t('cancel'), style: 'cancel' },
            {
              text: i18n.t('shareContactTooLarge_shareAsFile'),
              onPress: () => {
                void shareContactAsFile()
              },
            },
          ]
        )
        return
      }
      // Unexpected error from link build — surface it the same way so the
      // user isn't left wondering why nothing happened.
      logger.error('Unexpected error building contact share link:', error)
      Alert.alert(
        i18n.t('shareContactFileFailed_title'),
        i18n.t('shareContactFileFailed_description')
      )
    }
  }, [
    contact,
    contactConversations,
    customFieldDefs,
    toast,
    shareContactAsFile,
  ])

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
          backgroundColor={heroBackground}
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
    heroBackground,
    navigation,
    params.id,
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
  // True only when at least one non-archived def has a value on this contact.
  // Archived defs (and orphan ids referencing purged defs) hold data but are
  // hidden by design — see CustomFieldsRow.
  const hasCustomFields =
    customFields !== undefined &&
    customFieldDefs.some((d) => !d.archived && !!customFields[d.id]?.length)

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
            contact={contact}
            isBibleStudy={isActiveBibleStudy}
            hasStudiedPreviously={hasStudiedPreviously}
            mostRecentStudy={mostRecentStudy}
            name={name}
            avatar={contact.avatar ?? { type: 'none', value: '' }}
            avatarBackground={contact.avatarBackground}
            heroBackground={heroBackground}
          />
          {developerTools && (
            <JsonViewer label={i18n.t('data')} value={contact} />
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
              backgroundColor: heroBackground,
            }}
          />
          <View
            style={{
              backgroundColor: heroBackground,
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
