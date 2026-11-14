import { Bookmark as BookmarkIcon } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import { RootStackParamList } from '@/types/rootStack'
import {
  GroupedList,
  GroupedListReorderSection,
  GroupedListTextFieldRow,
  type GroupedListTextFieldRowRef,
} from '@/components/ui/GroupedList'
import { moveItem } from '@/lib/reorder'
import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import { useCustomFieldPrivacyNote } from '@/components/CustomFieldPrivacyWarning'
import useSavedContactViews from '@/features/contacts/hooks/useSavedContactViews'
import { contactSortLabel } from '@/features/contacts/lib/contactsQueryLabels'
import {
  SAVED_VIEW_NAME_MAX_LENGTH,
  resolveCustomFieldReferences,
} from '@/features/contacts/lib/savedViews'

type Props = NativeStackScreenProps<RootStackParamList, 'Saved Contact Views'>

const SavedViewsScreen = ({ navigation, route }: Props) => {
  const theme = useTheme()
  const { customFieldDefs } = useContacts()
  const { views, rename, reorder, confirmRemove } = useSavedContactViews()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const note = useCustomFieldPrivacyNote(Object.values(drafts))
  const focusRef = useRef<GroupedListTextFieldRowRef>(null)
  const focusId = route.params?.focusId

  useEffect(() => {
    if (!focusId) return
    return navigation.addListener('transitionEnd', (e) => {
      if (!e.data.closing) focusRef.current?.focus()
    })
  }, [navigation, focusId])

  const commit = (id: string) => {
    const draft = drafts[id]
    if (draft !== undefined) rename(id, draft)
    setDrafts((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  return (
    <GroupedList
      editing
      header={
        views.length === 0 ? (
          <Empty
            icon={
              <LucideIcon
                icon={BookmarkIcon}
                size={24}
                color={theme.colors.text}
              />
            }
            title={i18n.t('savedViews_empty_title')}
            description={i18n.t('savedViews_empty_description')}
          />
        ) : undefined
      }
    >
      {views.length > 0 && (
        <GroupedListReorderSection
          footer={note}
          data={views}
          keyExtractor={(view) => view.id}
          onMove={(from, to) =>
            reorder(
              moveItem(
                views.map((view) => view.id),
                from,
                to
              )
            )
          }
        >
          {(view) => {
            const query = resolveCustomFieldReferences(view, customFieldDefs)
            return (
              <GroupedListTextFieldRow
                ref={view.id === focusId ? focusRef : undefined}
                accessibilityLabel={view.name}
                value={drafts[view.id] ?? view.name}
                onChangeText={(name) =>
                  setDrafts((current) => ({ ...current, [view.id]: name }))
                }
                onEndEditing={() => commit(view.id)}
                maxLength={SAVED_VIEW_NAME_MAX_LENGTH}
                autoCapitalize='sentences'
                sublabel={i18n.t('savedViews_summary', {
                  filters: i18n.t('savedViews_filterCount', {
                    count: query.filters.length,
                  }),
                  sort: contactSortLabel(query.sort, customFieldDefs),
                })}
                menuLabel={i18n.t('moreActionsFor', { name: view.name })}
                menuActions={[
                  {
                    id: 'delete-view',
                    title: i18n.t('delete'),
                    systemImage: 'trash',
                    destructive: true,
                    onPress: () => confirmRemove(view.id),
                  },
                ]}
              />
            )
          }}
        </GroupedListReorderSection>
      )}
    </GroupedList>
  )
}

export default SavedViewsScreen
