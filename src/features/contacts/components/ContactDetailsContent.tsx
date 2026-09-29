import {
  getContactInformationFields,
  hasContactInformationValue,
} from '@/lib/contactInformationFields'
import { BookOpen as BookOpenIcon } from 'lucide-react-native'
import { Platform, View, ScrollView } from 'react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useContacts from '@/stores/contactsStore'
import Header from '@/components/ui/layout/Header'
import CardWithTitle from '@/components/CardWithTitle'
import { Contact } from '@/types/contact'
import { FlashList } from '@shopify/flash-list'
import ConversationRow from '@/features/contacts/components/ConversationRow'
import useConversations from '@/stores/conversationStore'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Divider from '@/components/ui/Divider'
import moment from 'moment'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import {
  contactHasAtLeastOneStudy,
  contactMostRecentStudy,
  contactStudiedForGivenMonth,
} from '@/lib/conversations'
import { Visit } from '@/types/visit'
import Wrapper from '@/components/ui/layout/Wrapper'
import { StatusBar } from 'expo-status-bar'
import IconButton from '@/components/ui/IconButton'
import Copyeable from '@/components/ui/Copyeable'
import Button from '@/components/ui/Button'
import ContextMenu from '@/components/ui/ContextMenu'
import { usePreferences } from '@/stores/preferences'
import XView from '@/components/ui/layout/XView'
import { getReadableTextColor, relativeLuminance } from '@/lib/color'
import Avatar, { isRenderableImageValue } from '@/components/ui/Avatar'
import GenderIcon from '@/features/contacts/components/GenderIcon'
import { ProfileAvatar } from '@/types/avatar'
import JsonViewer from '@/features/contacts/components/JsonViewer'
import ContactAvatarViewer from '@/features/contacts/components/ContactAvatarViewer'
import ContactInformationRows from '@/features/contacts/components/ContactInformationRows'
import ContactAddressRow from '@/features/contacts/components/ContactAddressRow'
import ContactDetailsActions, {
  AddVisitMenu,
  type ContactDetailsNavigation,
} from '@/features/contacts/components/ContactDetailsActions'
import useContactHeroBackground from '@/features/contacts/hooks/useContactHeroBackground'
import useContactAvatarActions from '@/features/contacts/hooks/useContactAvatarActions'

type Props = {
  id: string
  highlightedVisitId?: string
  navigation: ContactDetailsNavigation
  embedded?: boolean
}

const Hero = ({
  contact,
  name,
  avatar,
  avatarBackground,
  heroBackground,
  heroForeground,
  isBibleStudy: isActiveBibleStudy,
  hasStudiedPreviously,
  mostRecentStudy,
  onEdit,
  compact = false,
}: {
  compact?: boolean
  /** Opens the contact form, e.g. to change a non-photo avatar. */
  onEdit: () => void
  contact: Contact
  name: string
  avatar: ProfileAvatar
  avatarBackground?: string | null
  heroBackground: string
  heroForeground: string
  isBibleStudy?: boolean
  hasStudiedPreviously?: boolean
  mostRecentStudy: Visit | null
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
  const photo = useContactAvatarActions(contact, isImageAvatar)
  const avatarSize = compact ? 96 : 134

  return (
    <View
      style={{
        paddingTop: compact ? 20 : 80,
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
          <ContextMenu
            analyticsSurface='contact_avatar'
            onPress={() => setViewerOpen(true)}
            accessibilityLabel={i18n.t('profilePicture')}
            actions={[
              [
                {
                  id: 'view',
                  title: i18n.t('viewPhoto'),
                  systemImage: 'photo',
                  onPress: () => setViewerOpen(true),
                },
              ],
              [
                {
                  id: 'edit_photo',
                  title: i18n.t('editPhotoEllipsis'),
                  systemImage: 'crop',
                  onPress: () => void photo.edit(),
                },
                {
                  id: 'save',
                  title: i18n.t('saveToPhotos'),
                  systemImage: 'square.and.arrow.down',
                  onPress: () => void photo.save(),
                },
                {
                  id: 'share',
                  title: i18n.t('shareEllipsis'),
                  systemImage: 'square.and.arrow.up',
                  onPress: () => void photo.share(),
                },
              ],
            ]}
          >
            <Avatar
              avatar={avatar}
              name={name}
              size={avatarSize}
              background={avatarBackground ?? undefined}
            />
          </ContextMenu>
        ) : Platform.OS === 'ios' ? (
          // The focusable Avatar owns its tap (the morph-to-center preview).
          // iOS layers the native long-press menu over it; on Android that
          // tap handler would swallow the long press, so Edit stays in the
          // More menu there.
          <ContextMenu
            analyticsSurface='contact_avatar'
            actions={[
              {
                id: 'edit',
                title: i18n.t('editEllipsis'),
                systemImage: 'pencil',
                onPress: onEdit,
              },
            ]}
          >
            <Avatar
              avatar={avatar}
              name={name}
              size={avatarSize}
              focusable
              background={avatarBackground ?? undefined}
            />
          </ContextMenu>
        ) : (
          <Avatar
            avatar={avatar}
            name={name}
            size={avatarSize}
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
      {isImageAvatar && photo.editor}
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
              color: heroForeground,
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
            color={heroForeground}
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
              color: heroForeground,
            }}
          >
            {isActiveBibleStudy
              ? i18n.t('isStudying')
              : `${i18n.t('lastStudied')} ${moment(mostRecentStudy.date).format(
                  'L'
                )}`}
          </Text>
          <IconButton
            icon={BookOpenIcon}
            iconStyle={{ color: heroForeground }}
          />
        </View>
      )}
      {!isActiveBibleStudy && hasStudiedPreviously && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: heroForeground,
            maxWidth: 250,
          }}
        >
          {i18n.t('inactiveBibleStudiesDoNoCountTowardsMonthlyTotals')}
        </Text>
      )}
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
        {i18n.t('created')} {formatDate(contact.createdAt)}
      </Text>
    </View>
  )
}

const ContactDetailsContent = ({
  id,
  highlightedVisitId,
  navigation,
  embedded = false,
}: Props) => {
  const theme = useTheme()
  const {
    developerTools,
    contactInformationOrder,
    showContactPhone,
    showContactEmail,
  } = usePreferences()
  const params = { id, highlightedVisitId }
  const insets = useSafeAreaInsets()
  const { contacts, customFieldDefs } = useContacts()
  const contact = useMemo(
    () => contacts.find((c) => c.id === params.id),
    [contacts, params.id]
  )
  const { conversations } = useConversations()
  const heroBackground = useContactHeroBackground(contact)
  // Hero tint is user-controllable per contact, so the fixed `textInverse`
  // token can collide with mid-luminance picks (e.g. a medium green). Pick
  // a contrasting foreground from the resolved background and reuse it for
  // both the hero text and the header chrome that overlays it.
  const heroForeground = useMemo(
    () => getReadableTextColor(heroBackground),
    [heroBackground]
  )
  const heroIsDark = useMemo(
    () => relativeLuminance(heroBackground) <= 0.45,
    [heroBackground]
  )

  const highlightedConversation = useMemo(
    () => conversations.find((c) => c.id === params.highlightedVisitId),
    [conversations, params.highlightedVisitId]
  )

  const scrollViewRef = useRef<ScrollView>(null)
  const highlightedRowRef = useRef<View>(null)

  // When opened via the widget deep link
  // (`witnesswork://contact/:id/:convId`), scroll the highlighted row into
  // view so the user can immediately see which conversation the widget was
  // pointing at. Delayed slightly so the FlashList has time to lay out.
  useEffect(() => {
    if (!params.highlightedVisitId || !highlightedConversation) return
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
  }, [params.highlightedVisitId, highlightedConversation])

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

  const editContact = () => {
    if (embedded)
      navigation.navigate('Contact Form', {
        id: params.id,
        edit: true,
        returnToContacts: true,
      })
    else navigation.replace('Contact Form', { id: params.id, edit: true })
  }

  useEffect(() => {
    if (embedded) return
    navigation.setOptions({
      header: () => (
        <Header
          noBottomBorder
          title=''
          buttonType='back'
          foregroundColor={heroForeground}
          rightElement={
            contact ? (
              <View style={{ position: 'absolute', right: 0 }}>
                <ContactDetailsActions
                  contact={contact}
                  navigation={navigation}
                  embedded={false}
                  color={heroForeground}
                />
              </View>
            ) : undefined
          }
          backgroundColor={heroBackground}
        />
      ),
    })
  }, [contact, embedded, heroBackground, heroForeground, navigation])

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

  const { name, address, coordinate } = contact

  const hasAddress =
    address && Object.values(address).some((v) => v?.length > 0)
  const hasInformation = getContactInformationFields(
    customFieldDefs,
    contactInformationOrder,
    {
      phone: showContactPhone,
      email: showContactEmail,
    }
  ).some((field) => hasContactInformationValue(contact, field))

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {embedded && (
        <View
          style={{
            width: '100%',
            maxWidth: 760,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 20,
            padding: 16,
            backgroundColor: heroBackground,
          }}
        >
          <ContactDetailsActions
            contact={contact}
            navigation={navigation}
            embedded
            color={heroForeground}
          />
        </View>
      )}
      <ScrollView
        ref={scrollViewRef}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
          paddingTop: embedded ? 0 : 100,
          marginTop: embedded ? 0 : -100,
          backgroundColor: theme.colors.background,
        }}
      >
        {!embedded && <StatusBar style={heroIsDark ? 'light' : 'dark'} />}

        <Wrapper
          insets='none'
          style={{
            marginBottom: embedded ? 24 : insets.bottom + 125,
            flexGrow: 1,
            flex: 1,
          }}
        >
          <Hero
            compact={embedded}
            contact={contact}
            isBibleStudy={isActiveBibleStudy}
            hasStudiedPreviously={hasStudiedPreviously}
            mostRecentStudy={mostRecentStudy}
            name={name}
            avatar={contact.avatar ?? { type: 'none', value: '' }}
            avatarBackground={contact.avatarBackground}
            heroBackground={heroBackground}
            heroForeground={heroForeground}
            onEdit={editContact}
          />
          {developerTools && (
            <JsonViewer label={i18n.t('data')} value={contact} />
          )}
          <View style={{ gap: 30 }}>
            <CardWithTitle
              titlePosition='inside'
              title={i18n.t('information')}
              style={{ margin: 20 }}
            >
              <View style={{ gap: 15 }}>
                {(hasAddress || coordinate) && (
                  <ContactAddressRow contact={contact} />
                )}
                <ContactInformationRows contact={contact} />
                {!hasAddress && !coordinate && !hasInformation && (
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
                <AddVisitMenu
                  contactId={contact.id}
                  navigation={navigation}
                  embedded={embedded}
                  color={theme.colors.text}
                  compact
                />
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
    </View>
  )
}

export default ContactDetailsContent
