import {
  Clock as ClockIcon,
  Star as StarIcon,
  Undo2 as Undo2Icon,
} from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import ContactPreview from '@/components/ContactPreview'
import Avatar from '@/components/ui/Avatar'
import Card from '@/components/ui/Card'
import ContextMenu from '@/components/ui/ContextMenu'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { useContactRemovalActions } from '@/hooks/useContactMenuActions'
import { useUndismissContacts } from '@/hooks/useDismissContact'
import { getMostRecentConversationForContact } from '@/lib/contacts'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import type { Contact } from '@/types/contact'
import GenderIcon from '@/features/contacts/components/GenderIcon'
import { SelectionCheck } from '@/features/contacts/components/ListSelection'

/** The long-press preview; mounted lazily, so it can read the store. */
function DismissedContactPreview({ contact }: { contact: Contact }) {
  const conversations = useConversations((s) => s.conversations)
  return (
    <ContactPreview
      contact={contact}
      lastVisit={getMostRecentConversationForContact({
        conversations,
        contact,
      })}
    />
  )
}

/**
 * A Dismissed Contacts row, styled like the Contacts list's `ContactRow` but
 * with "Dismissed until {date}" as its secondary line. Tap opens the contact;
 * long press offers Undismiss and Archive (Delete in data protection mode). The
 * trailing button undismisses in one tap. In Select mode taps toggle the
 * check.
 */
export default function DismissedContactRow({
  contact,
  onPress,
  selectionMode,
  checked,
}: {
  contact: Contact
  onPress: () => void
  selectionMode: boolean
  checked: boolean
}) {
  const theme = useTheme()
  const undismiss = useUndismissContacts()
  const { archive } = useContactRemovalActions(contact)

  const cardStyle = {
    borderRadius: theme.numbers.borderRadiusSm,
    backgroundColor:
      selectionMode && checked
        ? theme.colors.accentTranslucent
        : theme.colors.backgroundLighter,
  }

  const details = (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
      {selectionMode && <SelectionCheck checked={checked} />}
      <Avatar
        avatar={contact.avatar ?? { type: 'none', value: '' }}
        name={contact.name}
        size={36}
        background={contact.avatarBackground ?? undefined}
      />
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 18, flexShrink: 1 }} numberOfLines={1}>
            {contact.name}
          </Text>
          {contact.gender && (
            <GenderIcon gender={contact.gender} size={10} opacity={0.6} />
          )}
        </View>
        {contact.dismissedUntil && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <LucideIcon
              icon={ClockIcon}
              size={9}
              style={{ color: theme.colors.textAlt }}
            />
            <Text
              style={{ color: theme.colors.textAlt, fontSize: 11, flex: 1 }}
              numberOfLines={1}
            >
              {i18n.t('dismissedUntil', {
                date: formatDate(contact.dismissedUntil, { style: 'medium' }),
              })}
            </Text>
          </View>
        )}
      </View>
      {contact.isFavorite && (
        <IconButton
          icon={StarIcon}
          iconStyle={{ color: theme.colors.warn }}
          fill={theme.colors.warn}
          size='sm'
        />
      )}
    </View>
  )

  if (selectionMode) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole='checkbox'
        accessibilityState={{ checked }}
        accessibilityLabel={contact.name}
      >
        <Card
          style={{ ...cardStyle, paddingHorizontal: 18, paddingVertical: 16 }}
        >
          {details}
        </Card>
      </Pressable>
    )
  }

  const undismissContact = () => void undismiss([contact])

  return (
    <Card
      style={{
        ...cardStyle,
        paddingVertical: 0,
        paddingHorizontal: 0,
        gap: 0,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {/* The menu owns taps and long presses on the row's content; the
          Undismiss button sits beside it so the two never compete. */}
      <ContextMenu
        style={{ flex: 1 }}
        analyticsSurface='dismissed_contact_row'
        onPress={onPress}
        accessibilityLabel={contact.name}
        preview={<DismissedContactPreview contact={contact} />}
        actions={[
          [
            {
              id: 'undismiss',
              title: i18n.t('undismiss'),
              systemImage: 'arrow.uturn.backward',
              onPress: undismissContact,
            },
          ],
          [archive],
        ]}
      >
        <View style={{ paddingVertical: 16, paddingLeft: 18, paddingRight: 8 }}>
          {details}
        </View>
      </ContextMenu>
      {/* Undismissing only puts the contact back in the list — nothing is
          lost, so it runs immediately rather than behind a confirmation. */}
      <IconButton
        onPress={undismissContact}
        icon={Undo2Icon}
        size='md'
        accessibilityLabel={i18n.t('undismiss')}
        hitSlop={6}
        color={theme.colors.accent}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          marginRight: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.accentTranslucent,
        }}
      />
    </Card>
  )
}
