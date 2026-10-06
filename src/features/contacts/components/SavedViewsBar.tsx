import { useNavigation } from '@react-navigation/native'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import SortableChipRow from '@/components/ui/SortableChipRow'
import useSavedContactViews from '@/features/contacts/hooks/useSavedContactViews'
import SavedViewChip from '@/features/contacts/components/SavedViewChip'

/**
 * One-tap switching between Saved Views on Contacts, above the list and the
 * map. Tapping the selected view leaves it, back to the User's own filters.
 * Dragging a chip reorders the views. The Contacts screen shows it only while a
 * view exists and isn't locked by a Supporter lapse.
 */
const SavedViewsBar = ({
  surface,
}: {
  /** Where the bar sits, for analytics. */
  surface: 'list' | 'map'
}) => {
  const navigation = useNavigation<RootStackNavigation>()
  const {
    views,
    hasAccess,
    activeView,
    edited,
    select,
    updateActive,
    reorder,
    confirmRemove,
  } = useSavedContactViews()

  return (
    <SortableChipRow
      data={views}
      keyExtractor={(view) => view.id}
      sortEnabled={hasAccess}
      longPressMenus
      onReorder={(next) => reorder(next.map((view) => view.id))}
      renderItem={(view) => {
        const selected = activeView?.id === view.id
        return (
          <SavedViewChip
            name={view.name}
            selected={selected}
            edited={selected && edited}
            onPress={
              hasAccess
                ? () => select(selected ? null : view.id, surface)
                : undefined
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
      }}
    />
  )
}

export default SavedViewsBar
