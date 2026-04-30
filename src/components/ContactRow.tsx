import { View, Alert } from 'react-native'
import Text from './MyText'
import useTheme from '../contexts/theme'
import Card from './Card'
import { Contact } from '../types/contact'
import useConversations from '../stores/conversationStore'
import { useMemo, useState } from 'react'
import moment from 'moment'
import i18n from '../lib/locales'
import {
  contactHasAtLeastOneStudy,
  contactStudiedForGivenMonth,
} from '../lib/conversations'
import IconButton from './IconButton'
import {
  faBook,
  faChevronRight,
  faComment,
  faEnvelope,
  faLocationDot,
  faPhone,
  faStar,
  faTag,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FuseResultMatch } from 'fuse.js'
import Button from './Button'
import { Swipeable } from 'react-native-gesture-handler'
import Haptics from '../lib/haptics'
import useContacts from '../stores/contactsStore'
import SwipeableArchive from './swipeableActions/Archive'
import SwipeableDismiss from './swipeableActions/Dismiss'
import DismissContactSheet from './DismissContactSheet'
import { useToastController } from '@tamagui/toast'
import Avatar from './Avatar'
import { getContactStaleness, stalenessToColor } from '../lib/contactStaleness'
import { useMarkerColors } from '../hooks/useMarkerColors'
import {
  findNameMatch,
  MatchSource,
  pickPreviewMatch,
} from '../lib/contactsSearch'
import HighlightedText from './contacts/HighlightedText'

const SNIPPET_CONTEXT_CHARS = 24

const ICON_BY_SOURCE: Record<Exclude<MatchSource, 'name'>, IconDefinition> = {
  customField: faTag,
  note: faComment,
  phone: faPhone,
  email: faEnvelope,
  address: faLocationDot,
}

const ContactRow = ({
  contact,
  onPress,
  searchMatches,
}: {
  contact: Contact
  onPress?: () => void
  /**
   * Per-key Fuse match metadata for the active search query, when there is one.
   * When provided, the row renders an inline highlight on the contact name and
   * a one-line preview snippet for the best non-name match (custom field,
   * conversation note, phone, email, or address).
   */
  searchMatches?: readonly FuseResultMatch[]
}) => {
  const theme = useTheme()
  const { deleteContact } = useContacts()
  const { conversations } = useConversations()
  const markerColors = useMarkerColors()
  const toast = useToastController()
  const [dismissSheetOpen, setDismissSheetOpen] = useState(false)

  const nameMatch = useMemo(() => findNameMatch(searchMatches), [searchMatches])
  const previewMatch = useMemo(
    () => pickPreviewMatch(searchMatches),
    [searchMatches]
  )

  const stripeColor = useMemo(
    () =>
      stalenessToColor(
        getContactStaleness(contact, conversations),
        markerColors
      ),
    [contact, conversations, markerColors]
  )

  const isActiveBibleStudy = useMemo(
    () =>
      contactStudiedForGivenMonth({
        contact,
        conversations,
        month: new Date(),
      }),
    [contact, conversations]
  )

  const hasStudiedPreviously = useMemo(
    () =>
      contactHasAtLeastOneStudy({
        conversations,
        contact,
      }),
    [contact, conversations]
  )

  const mostRecentConversation = useMemo(() => {
    const filteredConversations = conversations.filter(
      (c) => c.contact.id === contact.id
    )
    const sortedConversations = filteredConversations.sort((a, b) =>
      moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
    )

    return sortedConversations.length > 0 ? sortedConversations[0] : null
  }, [contact.id, conversations])

  const handleSwipeOpen = (
    direction: 'left' | 'right',
    swipeable: Swipeable
  ) => {
    if (direction === 'left') {
      // Dismiss action
      setDismissSheetOpen(true)
      swipeable.reset()
    } else if (direction === 'right') {
      // Archive action
      Alert.alert(
        i18n.t('archiveContact_question'),
        i18n.t('archiveContact_description'),
        [
          {
            text: i18n.t('cancel'),
            style: 'cancel',
            onPress: () => swipeable.reset(),
          },
          {
            text: i18n.t('delete'),
            style: 'destructive',
            onPress: () => {
              swipeable.reset()
              toast.show(i18n.t('success'), {
                message: i18n.t('archived'),
                native: true,
              })
              deleteContact(contact.id)
            },
          },
        ]
      )
    }
  }

  return (
    <Button onPress={onPress}>
      <Card
        style={{
          paddingHorizontal: 18,
          paddingVertical: 16,
          borderRadius: theme.numbers.borderRadiusSm,
          backgroundColor: theme.colors.backgroundLighter,
          overflow: 'hidden',
        }}
      >
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            backgroundColor: stripeColor,
          }}
        />
        <Swipeable
          onSwipeableWillOpen={() => Haptics.light()}
          containerStyle={{ backgroundColor: theme.colors.backgroundLighter }}
          renderLeftActions={() => <SwipeableDismiss size='sm' />}
          renderRightActions={() => <SwipeableArchive size='sm' />}
          onSwipeableOpen={handleSwipeOpen}
        >
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
            <Avatar
              avatar={contact.avatar ?? { type: 'none', value: '' }}
              name={contact.name}
              size={36}
              background={contact.avatarBackground ?? undefined}
            />
            <View style={{ flexGrow: 1, flexShrink: 1, gap: 2 }}>
              <HighlightedText
                text={contact.name}
                match={nameMatch}
                baseStyle={{ fontSize: 18 }}
                numberOfLines={1}
              />
              {previewMatch ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <FontAwesomeIcon
                    icon={ICON_BY_SOURCE[previewMatch.source]}
                    size={9}
                    style={{ color: theme.colors.textAlt }}
                  />
                  <View style={{ flex: 1 }}>
                    <HighlightedText
                      text={previewMatch.match.value ?? ''}
                      match={previewMatch.match}
                      contextChars={SNIPPET_CONTEXT_CHARS}
                      baseStyle={{
                        color: theme.colors.textAlt,
                        fontSize: 11,
                      }}
                      numberOfLines={1}
                    />
                  </View>
                </View>
              ) : (
                <Text
                  style={{ color: theme.colors.textAlt, fontSize: 10 }}
                  numberOfLines={1}
                >
                  {mostRecentConversation
                    ? moment(mostRecentConversation.date).fromNow()
                    : i18n.t('noRecentConversation_plural')}
                  {contact.address?.city ? ` · ${contact.address.city}` : ''}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {hasStudiedPreviously && (
                <IconButton
                  iconStyle={{
                    color: isActiveBibleStudy
                      ? theme.colors.text
                      : theme.colors.textAlt,
                  }}
                  icon={faBook}
                />
              )}
              {contact.isFavorite && (
                <IconButton
                  icon={faStar}
                  iconStyle={{ color: theme.colors.warn }}
                  size='sm'
                />
              )}
              <IconButton
                iconStyle={{
                  color: isActiveBibleStudy
                    ? theme.colors.text
                    : theme.colors.textAlt,
                }}
                icon={faChevronRight}
              />
            </View>
          </View>
        </Swipeable>
      </Card>
      <DismissContactSheet
        open={dismissSheetOpen}
        setOpen={setDismissSheetOpen}
        contact={contact}
      />
    </Button>
  )
}

export default ContactRow
