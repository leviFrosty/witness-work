import { Trash2 as Trash2Icon, Undo2 as Undo2Icon } from 'lucide-react-native'
import { Pressable, ScrollView, View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useContacts from '@/stores/contactsStore'
import moment from 'moment'
import { formatDate } from '@/lib/dates'
import Card from '@/components/ui/Card'
import ContextMenu from '@/components/ui/ContextMenu'
import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import { ArchiveRestore as ArchiveRestoreIcon } from 'lucide-react-native'
import useConversations from '@/stores/conversationStore'
import { FlashList } from '@shopify/flash-list'
import i18n from '@/lib/locales'
import confirmDestructive from '@/lib/confirmDestructive'
import Wrapper from '@/components/ui/layout/Wrapper'
import IconButton from '@/components/ui/IconButton'
import { useToastController } from '@tamagui/toast'
import { isRedactedContactTombstone } from '@/lib/dataProtection'
import type { Contact } from '@/types/contact'
import {
  SELECTION_BAR_HEIGHT,
  SelectionBar,
  SelectionBarButton,
  SelectionCheck,
  SelectionTextButton,
} from '@/features/contacts/components/ListSelection'
import useListSelection from '@/features/contacts/hooks/useListSelection'

const RecoverContactsScreen = () => {
  const theme = useTheme()
  const { deleteConversation } = useConversations()
  const { deletedContacts, recoverContact, removeDeletedContact } =
    useContacts()
  const toast = useToastController()
  const insets = useSafeAreaInsets()

  // Tombstones written by a data-protection hard delete keep nothing but an id
  // and a timestamp, so there is nothing to show and nothing to restore. They
  // stay in the store (iCloud needs them to propagate the deletion) but are
  // filtered out here rather than rendered as blank, un-recoverable rows.
  const recoverable = deletedContacts.filter(
    (c) => !isRedactedContactTombstone(c)
  )

  const sortedContacts = [...recoverable].sort((a, b) =>
    moment(a.createdAt).unix() < moment(b.createdAt).unix() ? 1 : -1
  )

  const selection = useListSelection(
    'recover_contacts',
    sortedContacts.map((contact) => contact.id)
  )

  const removePermanently = (ids: string[]) => {
    const targets = new Set(ids)
    ids.forEach((id) => removeDeletedContact(id))
    useConversations
      .getState()
      .conversations.filter((convo) => targets.has(convo.contact.id))
      .forEach((convo) => deleteConversation(convo.id))
    toast.show(i18n.t('success'), {
      message: i18n.t('deleted'),
      native: true,
    })
  }

  const recover = (ids: string[]) => {
    ids.forEach((id) => recoverContact(id))
    toast.show(i18n.t('success'), {
      message: i18n.t('recovered'),
      native: true,
    })
  }

  const confirmRemove = (ids: string[], onDone?: () => void) =>
    confirmDestructive({
      title:
        ids.length === 1
          ? i18n.t('permanentlyDelete')
          : // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
            i18n.t('deleteContacts_question', { count: ids.length }),
      description: i18n.t(
        ids.length === 1
          ? 'permanentlyDeleteContact_warning'
          : 'permanentlyDeleteContacts_warning'
      ),
      onConfirm: () => {
        removePermanently(ids)
        onDone?.()
      },
    })

  const recoverSelected = () => {
    selection.track('recover')
    const ids = selection.ids
    selection.finish()
    recover(ids)
  }

  const deleteSelected = () =>
    confirmRemove(selection.ids, () => {
      selection.track('delete_permanently')
      selection.finish()
    })

  const renderRow = (item: Contact) => {
    const checked = selection.isSelected(item.id)
    const created = (
      <Text
        style={{
          fontSize: 10,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {`${i18n.t('created')} ${formatDate(item.createdAt)}`}
      </Text>
    )

    if (selection.selecting) {
      return (
        <Pressable
          onPress={() => selection.toggle(item.id)}
          accessibilityRole='checkbox'
          accessibilityState={{ checked }}
          accessibilityLabel={item.name}
        >
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: checked
                ? theme.colors.accentTranslucent
                : theme.colors.card,
            }}
          >
            <SelectionCheck checked={checked} />
            <View style={{ gap: 5, flexShrink: 1 }}>
              {created}
              <Text>{item.name}</Text>
            </View>
          </Card>
        </Pressable>
      )
    }

    return (
      <Card
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <IconButton
          onPress={() => recover([item.id])}
          icon={Undo2Icon}
          accessibilityLabel={i18n.t('recover')}
        />
        <ContextMenu
          style={{ flex: 1 }}
          analyticsSurface='recover_contact_row'
          accessibilityLabel={item.name}
          actions={[
            [
              {
                id: 'recover',
                title: i18n.t('recover'),
                systemImage: 'arrow.uturn.backward',
                onPress: () => recover([item.id]),
              },
            ],
            [
              {
                id: 'delete_permanently',
                title: i18n.t('deletePermanentlyEllipsis'),
                systemImage: 'trash',
                destructive: true,
                onPress: () => confirmRemove([item.id]),
              },
            ],
          ]}
        >
          <View style={{ gap: 5 }}>
            {created}
            <Text>{item.name}</Text>
          </View>
        </ContextMenu>
      </Card>
    )
  }

  return (
    <Wrapper
      insets='none'
      style={{
        flex: 1,
        flexGrow: 1,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexGrow: 1 }}>
        <View style={{ padding: 25, gap: 5 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Text
              style={{
                fontSize: 32,
                fontFamily: theme.fonts.bold,
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {selection.selecting
                ? // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
                  i18n.t('selectedCount', { count: selection.ids.length })
                : i18n.t('recoverContacts')}
            </Text>
            {selection.selecting ? (
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <SelectionTextButton
                  label={i18n.t(
                    selection.allSelected ? 'deselectAll' : 'selectAll'
                  )}
                  onPress={selection.toggleAll}
                />
                <SelectionTextButton
                  label={i18n.t('done')}
                  emphasized
                  onPress={selection.finish}
                />
              </View>
            ) : (
              sortedContacts.length > 0 && (
                <SelectionTextButton
                  label={i18n.t('select')}
                  onPress={() => selection.start()}
                />
              )
            )}
          </View>
          <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            {i18n.t('recoverContacts_description')}
          </Text>
        </View>
        <ScrollView
          style={{ paddingBottom: insets.bottom + 60 }}
          contentInset={{
            top: 0,
            right: 0,
            bottom:
              insets.bottom +
              30 +
              (selection.selecting ? SELECTION_BAR_HEIGHT : 0),
            left: 0,
          }}
        >
          <View
            style={{
              gap: 20,
              paddingHorizontal: 10,
              marginBottom:
                insets.bottom +
                (selection.selecting ? SELECTION_BAR_HEIGHT + 12 : 0),
            }}
          >
            {recoverable.length === 0 && (
              <Empty
                icon={
                  <LucideIcon
                    icon={ArchiveRestoreIcon}
                    size={24}
                    color={theme.colors.text}
                  />
                }
                title={i18n.t('deletedContactsWillAppearHere')}
              />
            )}
            <View style={{ minHeight: 2 }}>
              <FlashList
                data={sortedContacts}
                extraData={`${selection.selecting}:${selection.ids.join()}`}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={{ padding: 6 }}>{renderRow(item)}</View>
                )}
              />
            </View>
          </View>
        </ScrollView>
      </View>
      {selection.selecting && (
        <SelectionBar bottom={insets.bottom + 12}>
          <SelectionBarButton
            icon={Undo2Icon}
            label={i18n.t('recover')}
            disabled={selection.ids.length === 0}
            onPress={recoverSelected}
          />
          <SelectionBarButton
            icon={Trash2Icon}
            label={i18n.t('deletePermanentlyEllipsis')}
            destructive
            disabled={selection.ids.length === 0}
            onPress={deleteSelected}
          />
        </SelectionBar>
      )}
    </Wrapper>
  )
}

export default RecoverContactsScreen
