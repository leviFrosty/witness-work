import { View } from 'react-native'

import Card from '@/components/ui/Card'
import InfoPopover from '@/components/ui/InfoPopover'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { SelectionTextButton } from '@/features/contacts/components/ListSelection'
import type { ListSelection } from '@/features/contacts/hooks/useListSelection'

/**
 * Title card for Dismissed Contacts, laid out like the Contacts list's: large
 * title with its help behind an info button, and the Select mode controls.
 */
export default function DismissedContactsHeader({
  selection,
  canSelect,
}: {
  selection: ListSelection
  /** False when there's nothing to select. */
  canSelect: boolean
}) {
  const theme = useTheme()
  const title = i18n.t('dismissedContacts')

  return (
    <Card style={{ paddingVertical: 16, paddingHorizontal: 16 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('2xl'),
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {selection.selecting
              ? // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
                i18n.t('selectedCount', { count: selection.ids.length })
              : title}
          </Text>
          {!selection.selecting && (
            <InfoPopover
              title={title}
              description={i18n.t('dismissedContactsHelp')}
              inline
            />
          )}
        </View>
        {selection.selecting ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
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
          canSelect && (
            <SelectionTextButton
              label={i18n.t('select')}
              onPress={() => selection.start()}
            />
          )
        )}
      </View>
    </Card>
  )
}
