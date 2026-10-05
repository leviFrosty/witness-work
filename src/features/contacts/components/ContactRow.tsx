import {
  BookOpen as BookOpenIcon,
  ChevronRight as ChevronRightIcon,
  Mail as MailIcon,
  MapPin as MapPinIcon,
  MessageCircle as MessageCircleIcon,
  Phone as PhoneIcon,
  Star as StarIcon,
  Tag as TagIcon,
} from 'lucide-react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import Card from '@/components/ui/Card'
import { Contact } from '@/types/contact'
import { useState } from 'react'
import i18n from '@/lib/locales'
import { formatRelative } from '@/lib/dates'
import IconButton from '@/components/ui/IconButton'
import { FuseResultMatch } from 'fuse.js'
import { Swipeable } from 'react-native-gesture-handler'
import Haptics from '@/lib/haptics'
import SwipeableArchive from '@/features/contacts/components/swipeableActions/Archive'
import SwipeableDismiss from '@/features/contacts/components/swipeableActions/Dismiss'
import DismissContactSheet from '@/features/contacts/components/DismissContactSheet'
import Avatar from '@/components/ui/Avatar'
import ContextMenu from '@/components/ui/ContextMenu'
import ContactPreview from '@/components/ContactPreview'
import { stalenessToColor } from '@/lib/contactStaleness'
import { ConversationIndex } from '@/lib/conversationIndex'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import useContactMenuActions, {
  useContactRemovalActions,
} from '@/hooks/useContactMenuActions'
import {
  findNameMatch,
  MatchSource,
  pickPreviewMatch,
} from '@/features/contacts/lib/contactsSearch'
import HighlightedText from '@/features/contacts/components/HighlightedText'
import GenderIcon from '@/features/contacts/components/GenderIcon'
import { SelectionCheck } from '@/features/contacts/components/ListSelection'
import useShareContact from '@/features/contacts/hooks/useShareContact'
import { usePreferences } from '@/stores/preferences'

const SNIPPET_CONTEXT_CHARS = 24

const ICON_BY_SOURCE: Record<Exclude<MatchSource, 'name'>, AppIcon> = {
  customField: TagIcon,
  note: MessageCircleIcon,
  phone: PhoneIcon,
  email: MailIcon,
  address: MapPinIcon,
}

const ContactRow = ({
  contact,
  onPress,
  searchMatches,
  index,
  selected = false,
  showsDisclosure = true,
  showOpenInMenu = false,
  onSelect,
  selectionMode = false,
  checked = false,
}: {
  selected?: boolean
  /** False when selecting this row updates an adjacent detail pane. */
  showsDisclosure?: boolean
  /** Adds "Open Contact" to the menu, for lists whose tap does something else. */
  showOpenInMenu?: boolean
  /** Adds "Select" to the long-press menu; starts Select mode on this row. */
  onSelect?: () => void
  /**
   * Select mode: the row shows a checkmark circle, reads as a checkbox, taps
   * call `onPress` to toggle it, and swipes are off.
   */
  selectionMode?: boolean
  /** Whether the row is checked in Select mode. */
  checked?: boolean
  contact: Contact
  onPress?: () => void
  /**
   * Per-key Fuse match metadata for the active search query, when there is one.
   * When provided, the row renders an inline highlight on the contact name and
   * a one-line preview snippet for the best non-name match (custom field,
   * conversation note, phone, email, or address).
   */
  searchMatches?: readonly FuseResultMatch[]
  /**
   * Shared per-contact conversation index built once by the list. Staleness,
   * study flags, and the most-recent conversation are O(1) lookups against it —
   * the row never scans the full conversations array.
   */
  index: ConversationIndex
}) => {
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const theme = useTheme()
  const markerColors = useMarkerColors()
  const [dismissSheetOpen, setDismissSheetOpen] = useState(false)
  // A closed Tamagui modal sheet still mounts its whole content through a
  // Portal, so rows only mount theirs once it's first asked for.
  const [dismissSheetMounted, setDismissSheetMounted] = useState(false)
  const share = useShareContact(contact)
  const menu = useContactMenuActions(contact, {
    showOpen: showOpenInMenu,
    onShare: share,
    onSelect,
  })
  const { archive } = useContactRemovalActions(contact)

  const nameMatch = findNameMatch(searchMatches)
  const previewMatch = pickPreviewMatch(searchMatches)
  const stripeColor = stalenessToColor(
    index.stalenessFor(contact.id),
    markerColors
  )
  const isActiveBibleStudy = index.studiedThisMonthIds.has(contact.id)
  const hasStudiedPreviously = index.studyContactIds.has(contact.id)
  const mostRecentConversation =
    index.mostRecentConvByContact.get(contact.id) ?? null

  // Reset the row before confirming: the confirm Alert can be cancelled, and a
  // half-open row behind a dismissed Alert reads as stuck.
  const handleSwipeOpen = (
    direction: 'left' | 'right',
    swipeable: Swipeable
  ) => {
    swipeable.reset()
    if (direction === 'left') {
      setDismissSheetMounted(true)
      setDismissSheetOpen(true)
    } else {
      archive?.onPress()
    }
  }

  // Everything inside is non-interactive: the wrapping ContextMenu owns taps
  // and long presses for the whole card. In Select mode the card itself is the
  // accessibility element, a checkbox.
  const card = (
    <Card
      accessible={selectionMode}
      accessibilityRole={selectionMode ? 'checkbox' : undefined}
      accessibilityState={selectionMode ? { checked } : undefined}
      accessibilityLabel={selectionMode ? contact.name : undefined}
      accessibilityActions={selectionMode ? [{ name: 'activate' }] : undefined}
      onAccessibilityAction={
        selectionMode
          ? (event) => {
              if (event.nativeEvent.actionName === 'activate') onPress?.()
            }
          : undefined
      }
      style={{
        paddingHorizontal: 18,
        paddingVertical: 16,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor:
          selected || (selectionMode && checked)
            ? theme.colors.accentTranslucent
            : theme.colors.backgroundLighter,
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
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
        {selectionMode && <SelectionCheck checked={checked} />}
        <Avatar
          avatar={contact.avatar ?? { type: 'none', value: '' }}
          name={contact.name}
          size={36}
          background={contact.avatarBackground ?? undefined}
        />
        <View style={{ flexGrow: 1, flexShrink: 1, gap: 2 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <View style={{ flexShrink: 1 }}>
              <HighlightedText
                text={contact.name}
                match={nameMatch}
                baseStyle={{ fontSize: 18 }}
                numberOfLines={1}
              />
            </View>
            {contact.gender && (
              <GenderIcon gender={contact.gender} size={10} opacity={0.6} />
            )}
          </View>
          {previewMatch ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <LucideIcon
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
                ? formatRelative(mostRecentConversation.date)
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
              fill={isActiveBibleStudy ? theme.colors.text : 'none'}
              icon={BookOpenIcon}
            />
          )}
          {contact.isFavorite && (
            <IconButton
              icon={StarIcon}
              iconStyle={{ color: theme.colors.warn }}
              fill={theme.colors.warn}
              size='sm'
            />
          )}
          {showsDisclosure && !selectionMode && (
            <IconButton
              iconStyle={{
                color: isActiveBibleStudy
                  ? theme.colors.text
                  : theme.colors.textAlt,
              }}
              icon={ChevronRightIcon}
            />
          )}
        </View>
      </View>
    </Card>
  )

  // The same tree in and out of Select mode, so switching modes (e.g. "Done"
  // after "Select All") re-renders the visible rows instead of remounting each
  // one's Swipeable and native context menu host. The menu stays available.
  return (
    <>
      <Swipeable
        enabled={!selectionMode}
        onSwipeableWillOpen={() => Haptics.light()}
        containerStyle={{ backgroundColor: 'transparent' }}
        renderLeftActions={() => <SwipeableDismiss size='sm' />}
        renderRightActions={() => (
          <SwipeableArchive size='sm' permanent={dataProtectionMode} />
        )}
        onSwipeableOpen={handleSwipeOpen}
      >
        <ContextMenu
          actions={menu}
          onPress={onPress}
          accessibilityLabel={contact.name}
          accessible={!selectionMode}
          disabled={selectionMode}
          preview={
            <ContactPreview
              contact={contact}
              lastVisit={mostRecentConversation}
            />
          }
        >
          {card}
        </ContextMenu>
      </Swipeable>
      {dismissSheetMounted && (
        <DismissContactSheet
          open={dismissSheetOpen}
          setOpen={setDismissSheetOpen}
          contact={contact}
        />
      )}
    </>
  )
}

export default ContactRow
