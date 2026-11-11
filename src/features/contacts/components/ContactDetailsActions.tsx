import { Pencil as PencilIcon, Star as StarIcon } from 'lucide-react-native'
import { View } from 'react-native'

import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'
import PullDownMenu from '@/components/ui/PullDownMenu'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useShareContact from '@/features/contacts/hooks/useShareContact'
import { useContactRemovalActions } from '@/hooks/useContactMenuActions'
import { isContactDismissed } from '@/lib/dismissedContacts'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import type { Contact } from '@/types/contact'
import type { RootStackNavigation } from '@/types/rootStack'

export type ContactDetailsNavigation = Pick<
  RootStackNavigation,
  'navigate' | 'replace' | 'popToTop' | 'goBack' | 'setOptions'
>

const MORE_SIZE = 22

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
  const theme = useTheme()
  const toggleFavoriteContact = useContacts((s) => s.toggleFavoriteContact)
  const share = useShareContact(contact)

  const { dismiss, archive, remove } = useContactRemovalActions(contact, {
    onDismissed: () => {
      if (!embedded) navigation.goBack()
    },
    onRemoved: () => {
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
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',

        gap: MIN_TOUCH_TARGET - (MORE_SIZE + theme.fontSize()) / 2,
      }}
    >
      <PointerTooltip
        label={i18n.t(
          contact.isFavorite ? 'removeFromFavorites' : 'addToFavorites'
        )}
        effect='none'
      >
        <IconButton
          icon={StarIcon}
          color={color}
          fill={contact.isFavorite ? color : 'none'}
          accessibilityLabel={i18n.t(
            contact.isFavorite ? 'removeFromFavorites' : 'addToFavorites'
          )}
          frame
          onPress={() => toggleFavoriteContact(contact.id)}
        />
      </PointerTooltip>
      <PointerTooltip label={i18n.t('edit')} effect='none'>
        <IconButton
          icon={PencilIcon}
          color={color}
          accessibilityLabel={i18n.t('edit')}
          testID='contact-details-edit'
          frame
          onPress={edit}
        />
      </PointerTooltip>
      <PointerTooltip label={i18n.t('moreActions')} effect='none'>
        <PullDownMenu
          accessibilityLabel={i18n.t('moreActions')}
          triggerColor={color}
          triggerSize={MORE_SIZE}
          actions={[
            [
              share && {
                id: 'share',
                title: i18n.t('shareEllipsis'),
                systemImage: 'square.and.arrow.up',
                onPress: share,
              },
            ],
            [!isContactDismissed(contact) && dismiss, archive, remove],
          ]}
        />
      </PointerTooltip>
    </View>
  )
}
