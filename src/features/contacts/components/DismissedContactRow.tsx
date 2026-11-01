import { Clock as ClockIcon, Star as StarIcon } from 'lucide-react-native'
import { UndoIcon } from '@/components/ui/DirectionalIcon'
import { useState } from 'react'
import { Pressable, View } from 'react-native'

import ContactPreview from '@/components/ContactPreview'
import ContactCard, {
  ContactCardBody,
  ContactCardSubtitle,
} from '@/components/ContactCard'
import ContextMenu from '@/components/ui/ContextMenu'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import useTheme from '@/contexts/theme'
import { useContactRemovalActions } from '@/hooks/useContactMenuActions'
import { useUndismissContacts } from '@/hooks/useDismissContact'
import { getMostRecentConversationForContact } from '@/lib/contacts'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import type { Contact } from '@/types/contact'
import { SelectionCheck } from '@/features/contacts/components/ListSelection'

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
  const { archive, remove } = useContactRemovalActions(contact)
  const [hovered, setHovered] = useState(false)

  const details = (
    <ContactCardBody
      contact={contact}
      leading={selectionMode && <SelectionCheck checked={checked} />}
      subtitle={
        contact.dismissedUntil && (
          <ContactCardSubtitle
            icon={
              <LucideIcon
                icon={ClockIcon}
                size={9}
                style={{ color: theme.colors.textAlt }}
              />
            }
          >
            {i18n.t('dismissedUntil', {
              date: formatDate(contact.dismissedUntil, { style: 'medium' }),
            })}
          </ContactCardSubtitle>
        )
      }
      trailing={
        contact.isFavorite && (
          <IconButton
            icon={StarIcon}
            iconStyle={{ color: theme.colors.warn }}
            fill={theme.colors.warn}
            size='sm'
          />
        )
      }
    />
  )
  const radius = theme.numbers.borderRadiusSm

  if (selectionMode) {
    return (
      <PointerHover onHoverChange={setHovered}>
        <Pressable
          onPress={onPress}
          accessibilityRole='checkbox'
          accessibilityState={{ checked }}
          accessibilityLabel={contact.name}
        >
          <ContactCard selected={checked}>{details}</ContactCard>
          <HoverTint visible={hovered} borderRadius={radius} />
        </Pressable>
      </PointerHover>
    )
  }

  const undismissContact = () => void undismiss([contact])

  return (
    <ContactCard
      style={{
        paddingVertical: 0,
        paddingHorizontal: 0,
        paddingEnd: 14,
        gap: 0,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {}
      <ContextMenu
        style={{ flex: 1 }}
        onPress={onPress}
        accessibilityLabel={contact.name}
        hoverRadius={radius}
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
          [archive, remove],
        ]}
      >
        <View style={{ paddingVertical: 16, paddingLeft: 18, paddingRight: 8 }}>
          {details}
        </View>
      </ContextMenu>
      {}
      <IconButton
        onPress={undismissContact}
        icon={UndoIcon}
        size='md'
        accessibilityLabel={i18n.t('undismiss')}
        frame
        color={theme.colors.accent}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.accentTranslucent,
        }}
      />
    </ContactCard>
  )
}
