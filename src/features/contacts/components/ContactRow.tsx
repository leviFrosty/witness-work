import {
  BookOpen as BookOpenIcon,
  Mail as MailIcon,
  MapPin as MapPinIcon,
  MessageCircle as MessageCircleIcon,
  Phone as PhoneIcon,
  Star as StarIcon,
  Tag as TagIcon,
} from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import ContactCard, {
  ContactCardBody,
  ContactCardSubtitle,
} from '@/components/ContactCard'
import { Contact } from '@/types/contact'
import { useState } from 'react'
import i18n from '@/lib/locales'
import { formatRelative } from '@/lib/dates'
import IconButton from '@/components/ui/IconButton'
import { FuseResultMatch } from 'fuse.js'
import SwipeableRow, {
  type Swipeable,
  type SwipeSide,
} from '@/components/ui/SwipeableRow'
import Haptics from '@/lib/haptics'
import SwipeableArchive from '@/features/contacts/components/swipeableActions/Archive'
import SwipeableDismiss from '@/features/contacts/components/swipeableActions/Dismiss'
import DismissContactSheet from '@/features/contacts/components/DismissContactSheet'
import ContextMenu from '@/components/ui/ContextMenu'
import ContactPreview from '@/components/ContactPreview'
import { stalenessToColor } from '@/lib/contactStaleness'
import { ConversationIndex } from '@/lib/conversationIndex'
import type { SuggestedRowDetail } from '@/lib/suggestedContacts'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import useContactMenuActions, {
  useContactRemovalActions,
} from '@/hooks/useContactMenuActions'
import useDismissContact, {
  notNowDismissOption,
} from '@/hooks/useDismissContact'
import {
  findNameMatch,
  MatchSource,
  pickPreviewMatch,
} from '@/lib/contactsSearch'
import HighlightedText from '@/features/contacts/components/HighlightedText'
import { SelectionCheck } from '@/features/contacts/components/ListSelection'
import useShareContact from '@/features/contacts/hooks/useShareContact'
import { usePreferences } from '@/stores/preferences'
import {
  contactRowAccessibilityLabel,
  previewText,
} from '@/features/contacts/lib/contactRowLabel'

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
  detail,
  index,
  selected = false,
  showsDisclosure = true,
  showOpenInMenu = false,
  onSelect,
  selectionMode = false,
  checked = false,
  offersNotNow = false,
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
  /** Adds "Not Now" to the menu, dismissing the Contact for 30 days. */
  offersNotNow?: boolean
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
   * Replaces the row's "last visit · city" line, e.g. with why a suggested
   * section lists the Contact or the value the list is sorted by. A search
   * match preview still wins.
   */
  detail?: SuggestedRowDetail
  /**
   * Shared per-contact conversation index built once by the list. Staleness,
   * study flags, and the most-recent conversation are O(1) lookups against it —
   * the row never scans the full conversations array.
   */
  index: ConversationIndex
}) => {
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const theme = useTheme()
  // At accessibility sizes the name wraps instead of cutting off.
  const largeText = useAccessibilityTextSize()
  const markerColors = useMarkerColors()
  const [dismissSheetOpen, setDismissSheetOpen] = useState(false)
  // A closed Tamagui modal sheet still mounts its whole content through a
  // Portal, so rows only mount theirs once it's first asked for.
  const [dismissSheetMounted, setDismissSheetMounted] = useState(false)
  const share = useShareContact(contact)
  const dismiss = useDismissContact()
  const menu = useContactMenuActions(contact, {
    showOpen: showOpenInMenu,
    onShare: share,
    onSelect,
    onNotNow: offersNotNow
      ? () => void dismiss(contact, notNowDismissOption)
      : undefined,
  })
  // Swiping archives; data protection mode, which keeps nothing to archive,
  // deletes instead.
  const { archive, remove } = useContactRemovalActions(contact)
  const swipeRemoval = archive ?? remove

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
  const lastVisitText = mostRecentConversation
    ? formatRelative(mostRecentConversation.date)
    : i18n.t('noRecentConversation_plural')
  const cityText = contact.address?.city ? ` · ${contact.address.city}` : ''
  // Screen readers get the row as one element, so the label carries what the
  // row shows: its second line and the study and favorite icons.
  const accessibilityLabel = contactRowAccessibilityLabel({
    name: contact.name,
    subtitle: previewMatch
      ? previewText(previewMatch.match, SNIPPET_CONTEXT_CHARS)
      : detail
        ? detail.text
        : `${lastVisitText}${cityText}`,
    study: hasStudiedPreviously
      ? isActiveBibleStudy
        ? 'active'
        : 'past'
      : null,
    favorite: !!contact.isFavorite,
  })

  // Reset the row before confirming: the confirm Alert can be cancelled, and a
  // half-open row behind a dismissed Alert reads as stuck.
  const handleSwipeOpen = (side: SwipeSide, swipeable: Swipeable) => {
    swipeable.reset()
    if (side === 'leading') {
      setDismissSheetMounted(true)
      setDismissSheetOpen(true)
    } else {
      swipeRemoval?.onPress()
    }
  }

  // Everything inside is non-interactive: the wrapping ContextMenu owns taps
  // and long presses for the whole card. In Select mode the card itself is the
  // accessibility element, a checkbox.
  const card = (
    <ContactCard
      accessible={selectionMode}
      accessibilityRole={selectionMode ? 'checkbox' : undefined}
      accessibilityState={selectionMode ? { checked } : undefined}
      accessibilityLabel={selectionMode ? accessibilityLabel : undefined}
      accessibilityActions={selectionMode ? [{ name: 'activate' }] : undefined}
      onAccessibilityAction={
        selectionMode
          ? (event) => {
              if (event.nativeEvent.actionName === 'activate') onPress?.()
            }
          : undefined
      }
      stripeColor={stripeColor}
      selected={selected || (selectionMode && checked)}
    >
      <ContactCardBody
        contact={contact}
        leading={selectionMode && <SelectionCheck checked={checked} />}
        name={
          <HighlightedText
            text={contact.name}
            match={nameMatch}
            baseStyle={{ fontSize: 18 }}
            numberOfLines={largeText ? undefined : 1}
          />
        }
        subtitle={
          previewMatch ? (
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
          ) : detail ? (
            <ContactCardSubtitle
              color={detail.tone === 'due' ? theme.colors.orange : undefined}
            >
              {detail.text}
            </ContactCardSubtitle>
          ) : (
            <ContactCardSubtitle>
              {lastVisitText}
              {cityText}
            </ContactCardSubtitle>
          )
        }
        trailing={
          // The row's label already says what these icons mean.
          <View
            style={{ flexDirection: 'row', gap: 10 }}
            accessibilityElementsHidden
            importantForAccessibility='no-hide-descendants'
          >
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
                icon={ChevronForwardIcon}
              />
            )}
          </View>
        }
      />
    </ContactCard>
  )

  // The same tree in and out of Select mode, so switching modes (e.g. "Done"
  // after "Select All") re-renders the visible rows instead of remounting each
  // one's Swipeable and native context menu host. The menu stays available.
  return (
    <>
      <SwipeableRow
        enabled={!selectionMode}
        onSwipeableWillOpen={() => Haptics.light()}
        containerStyle={{ backgroundColor: 'transparent' }}
        renderLeadingActions={() => <SwipeableDismiss size='sm' />}
        renderTrailingActions={() => (
          <SwipeableArchive size='sm' permanent={dataProtectionMode} />
        )}
        onSwipeableOpen={handleSwipeOpen}
      >
        <ContextMenu
          actions={menu}
          onPress={onPress}
          accessibilityLabel={accessibilityLabel}
          testID={`contact-row-${contact.id}`}
          accessible={!selectionMode}
          disabled={selectionMode}
          hoverRadius={theme.numbers.borderRadiusSm}
          preview={
            <ContactPreview
              contact={contact}
              lastVisit={mostRecentConversation}
            />
          }
        >
          {card}
        </ContextMenu>
      </SwipeableRow>
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
