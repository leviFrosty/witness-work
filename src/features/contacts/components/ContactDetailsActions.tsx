import { Plus as PlusIcon, Star as StarIcon } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import useTheme from '@/contexts/theme'
import useShareContact from '@/features/contacts/hooks/useShareContact'
import { useContactRemovalActions } from '@/hooks/useContactMenuActions'
import { isContactDismissed } from '@/lib/dismissedContacts'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'
import type { RootStackNavigation } from '@/types/rootStack'

export type ContactDetailsNavigation = Pick<
  RootStackNavigation,
  'navigate' | 'replace' | 'popToTop' | 'goBack' | 'setOptions'
>

/**
 * "+ Add": a pull-down of what to record — a conversation or a not-at-home.
 * Data protection mode drops not-at-home records, leaving one choice, so the
 * button adds a conversation directly.
 */
export function AddVisitMenu({
  contactId,
  navigation,
  color,
  compact = false,
}: {
  contactId: string
  navigation: ContactDetailsNavigation
  color: string
  compact?: boolean
}) {
  const theme = useTheme()
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)

  const add = (notAtHome: boolean) => {
    // Push over the details so Back and Save both return here.
    navigation.navigate('Visit Form', {
      contactId,
      notAtHome,
      returnToContacts: true,
    })
  }

  const trigger = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: compact ? 32 : 36,
        paddingHorizontal: 10,
        borderColor: color,
        borderWidth: 1,
        borderRadius: theme.numbers.borderRadiusSm,
      }}
    >
      <LucideIcon icon={PlusIcon} color={color} size={compact ? 14 : 16} />
      <Text
        style={{
          color,
          fontSize: compact ? theme.fontSize('sm') : undefined,
        }}
      >
        {i18n.t('add')}
      </Text>
    </View>
  )

  if (dataProtectionMode) {
    return (
      <Pressable
        onPress={() => add(false)}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('addConversation')}
        hitSlop={8}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        {trigger}
      </Pressable>
    )
  }

  return (
    <PullDownMenu
      accessibilityLabel={i18n.t('add')}
      actions={[
        {
          id: 'conversation',
          title: i18n.t('conversation'),
          systemImage: 'bubble.left.and.bubble.right',
          onPress: () => add(false),
        },
        {
          id: 'not_at_home',
          title: i18n.t('notAtHome'),
          systemImage: 'door.left.hand.closed',
          onPress: () => add(true),
        },
      ]}
    >
      {trigger}
    </PullDownMenu>
  )
}

/**
 * Contact Details' toolbar: More (Share…, Edit | Dismiss For ▸, Archive), the
 * favorite star, and "+ Add" as the primary action. Used by the pushed screen's
 * header and the iPad detail pane.
 */
export default function ContactDetailsActions({
  contact,
  navigation,
  embedded,
  color,
}: {
  contact: Contact
  navigation: ContactDetailsNavigation
  embedded: boolean
  color: string
}) {
  const toggleFavoriteContact = useContacts((s) => s.toggleFavoriteContact)
  const share = useShareContact(contact)
  // The pushed screen leaves once its contact is hidden; the iPad pane just
  // moves on to the next contact in the list.
  const { dismiss, archive } = useContactRemovalActions(contact, {
    onDismissed: () => {
      if (!embedded) navigation.goBack()
    },
    onArchived: () => {
      if (!embedded) navigation.popToTop()
    },
  })

  const edit = () =>
    navigation.navigate('Contact Form', {
      id: contact.id,
      edit: true,
      returnToContacts: true,
    })

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
      <PullDownMenu
        accessibilityLabel={i18n.t('moreActions')}
        triggerColor={color}
        triggerSize={22}
        actions={[
          [
            share && {
              id: 'share',
              title: i18n.t('shareEllipsis'),
              systemImage: 'square.and.arrow.up',
              onPress: share,
            },
            {
              id: 'edit',
              title: i18n.t('edit'),
              systemImage: 'pencil',
              onPress: edit,
            },
          ],
          [!isContactDismissed(contact) && dismiss, archive],
        ]}
      />
      <IconButton
        icon={StarIcon}
        color={color}
        fill={contact.isFavorite ? color : 'none'}
        accessibilityLabel={i18n.t(
          contact.isFavorite ? 'removeFromFavorites' : 'addToFavorites'
        )}
        onPress={() => toggleFavoriteContact(contact.id)}
      />
      <AddVisitMenu
        contactId={contact.id}
        navigation={navigation}
        color={color}
      />
    </View>
  )
}
