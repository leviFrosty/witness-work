import { ScrollView } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import useSavedContactViews from '@/features/contacts/hooks/useSavedContactViews'
import SavedViewChip from '@/features/contacts/components/SavedViewChip'

/**
 * One-tap switching between Saved Views on the Contacts list. Tapping the
 * selected view leaves it, back to the User's own filters. The Contacts screen
 * shows it only while a view exists and isn't locked by a Supporter lapse.
 */
const SavedViewsBar = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const {
    views,
    hasAccess,
    activeView,
    edited,
    select,
    updateActive,
    confirmRemove,
  } = useSavedContactViews()

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps='handled'
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
    >
      {views.map((view) => {
        const selected = activeView?.id === view.id
        return (
          <SavedViewChip
            key={view.id}
            name={view.name}
            selected={selected}
            edited={selected && edited}
            onPress={
              hasAccess ? () => select(selected ? null : view.id) : undefined
            }
            actions={
              hasAccess
                ? [
                    [
                      selected &&
                        edited && {
                          id: 'update',
                          title: i18n.t('savedViews_menu_update'),
                          systemImage: 'square.and.arrow.down',
                          onPress: updateActive,
                        },
                      {
                        id: 'rename',
                        title: i18n.t('savedViews_menu_rename'),
                        systemImage: 'pencil',
                        onPress: () =>
                          navigation.navigate('Saved Contact Views', {
                            focusId: view.id,
                          }),
                      },
                    ],
                    [
                      {
                        id: 'delete',
                        title: i18n.t('savedViews_menu_delete'),
                        systemImage: 'trash',
                        destructive: true,
                        onPress: () => confirmRemove(view.id),
                      },
                    ],
                  ]
                : []
            }
          />
        )
      })}
    </ScrollView>
  )
}

export default SavedViewsBar
