import { Ref, useState } from 'react'
import { View } from 'react-native'
import type { InputRef } from 'tamagui'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { CustomFieldDefinition } from '@/types/customField'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import MyTextInput from '@/components/ui/TextInput'
import Text from '@/components/ui/MyText'
import ReorderControls from '@/components/ui/ReorderControls'
import PullDownMenu from '@/components/ui/PullDownMenu'
import CustomFieldPrivacyWarning from '@/components/CustomFieldPrivacyWarning'
import { contactSortLabel } from '@/features/contacts/lib/contactsQueryLabels'
import {
  SAVED_VIEW_NAME_MAX_LENGTH,
  type SavedContactViewEntry,
  resolveCustomFieldReferences,
} from '@/features/contacts/lib/savedViews'

const SavedViewRow = ({
  view,
  first,
  last,
  customFieldDefs,
  inputRef,
  onRename,
  onMove,
  onDelete,
}: {
  view: SavedContactViewEntry
  first: boolean
  last: boolean
  customFieldDefs: CustomFieldDefinition[]
  inputRef?: Ref<InputRef>
  onRename: (name: string) => void
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}) => {
  const theme = useTheme()

  const [draftName, setDraftName] = useState<string | null>(null)
  const name = draftName ?? view.name
  const query = resolveCustomFieldReferences(view, customFieldDefs)

  return (
    <View>
      <InputRowContainer
        lastInSection={last}
        controlWidth='full'
        controlStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <ReorderControls
          onMoveUp={first ? undefined : () => onMove(-1)}
          onMoveDown={last ? undefined : () => onMove(1)}
        />
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <MyTextInput
            ref={inputRef}
            value={name}
            onChangeText={setDraftName}
            onEndEditing={() => {
              onRename(name)
              setDraftName(null)
            }}
            accessibilityLabel={i18n.t('savedViews_nameLabel')}
            maxLength={SAVED_VIEW_NAME_MAX_LENGTH}
            autoCapitalize='sentences'
            textAlign='start'
          />
          <Text
            numberOfLines={1}
            style={{
              paddingHorizontal: 4,
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('savedViews_summary', {
              filters: i18n.t('savedViews_filterCount', {
                count: query.filters.length,
              }),
              sort: contactSortLabel(query.sort, customFieldDefs),
            })}
          </Text>
        </View>
        <PullDownMenu
          triggerSize={16}
          accessibilityLabel={i18n.t('moreActionsFor', { name: view.name })}
          actions={[
            {
              id: 'delete-view',
              title: i18n.t('delete'),
              systemImage: 'trash',
              destructive: true,
              onPress: onDelete,
            },
          ]}
        />
      </InputRowContainer>
      <CustomFieldPrivacyWarning texts={[name]} />
    </View>
  )
}

export default SavedViewRow
