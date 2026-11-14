import useFormValidation from '@/hooks/useFormValidation'
import { useCustomFieldPrivacyNote } from '@/components/CustomFieldPrivacyWarning'
import { analytics } from '@/lib/analytics'
import { useState } from 'react'
import {
  GroupedList,
  GroupedListReorderSection,
  GroupedListRow,
  GroupedListSection,
  GroupedListTextFieldRow,
} from '@/components/ui/GroupedList'
import { moveItem } from '@/lib/reorder'
import i18n from '@/lib/locales'
import confirmDestructive from '@/lib/confirmDestructive'
import useConversations from '@/stores/conversationStore'
import { activeCustomFieldDefs } from '@/lib/customFields'

const FIELD_NAME_MAX_LENGTH = 14

const PreferencesConversationFieldsScreen = () => {
  const {
    conversationFieldDefs,
    addConversationFieldDef,
    renameConversationFieldDef,
    reorderConversationFieldDefs,
    archiveConversationFieldDef,
    restoreConversationFieldDef,
    purgeConversationFieldDef,
  } = useConversations()

  const [newFieldName, setNewFieldName] = useState('')
  const validation = useFormValidation(
    { name: !newFieldName.trim() },
    'conversation_field'
  )

  const [edits, setEdits] = useState<Record<string, string>>({})

  const activeDefs = activeCustomFieldDefs(conversationFieldDefs)
  const archivedDefs = conversationFieldDefs
    .filter((d) => d.archived)
    .sort((a, b) => a.order - b.order)

  const newFieldNote = useCustomFieldPrivacyNote([newFieldName])
  const activeNote = useCustomFieldPrivacyNote(Object.values(edits))

  const handleAdd = () => {
    if (!validation.validate()) return
    addConversationFieldDef(newFieldName)
    analytics.capture('custom_field_created', { scope: 'conversation' })
    setNewFieldName('')
  }

  const rename = (id: string, label: string) => {
    const trimmed = edits[id]?.trim()
    if (trimmed && trimmed !== label) renameConversationFieldDef(id, trimmed)
    setEdits((s) => {
      const next = { ...s }
      delete next[id]
      return next
    })
  }

  const confirmArchive = (id: string, label: string) => {
    confirmDestructive({
      title: i18n.t('archiveField'),
      description: i18n.t('archiveConversationField_description', { label }),
      confirmLabel: i18n.t('archive'),
      onConfirm: () => {
        archiveConversationFieldDef(id)
      },
    })
  }

  const confirmPermanentDelete = (id: string, label: string) => {
    confirmDestructive({
      title: i18n.t('permanentlyDelete'),
      description: i18n.t('permanentlyDeleteConversationField_warning', {
        label,
      }),
      confirmLabel: i18n.t('delete'),
      onConfirm: () => {
        purgeConversationFieldDef(id)
      },
    })
  }

  return (
    <GroupedList title={i18n.t('manageContactFields')} editing>
      <GroupedListSection title={i18n.t('addNewField')} footer={newFieldNote}>
        <GroupedListTextFieldRow
          accessibilityLabel={i18n.t('addNewField')}
          placeholder={i18n.t('conversationField_placeholder')}
          invalid={validation.invalid('name')}
          value={newFieldName}
          onChangeText={setNewFieldName}
          maxLength={FIELD_NAME_MAX_LENGTH}
          action={{ label: i18n.t('add'), onPress: handleAdd }}
        />
      </GroupedListSection>

      {activeDefs.length > 0 && (
        <GroupedListReorderSection
          title={i18n.t('active')}
          footer={activeNote}
          data={activeDefs}
          keyExtractor={(def) => def.id}
          onMove={(from, to) =>
            reorderConversationFieldDefs(
              moveItem(
                activeDefs.map((def) => def.id),
                from,
                to
              )
            )
          }
        >
          {(def) => (
            <GroupedListTextFieldRow
              accessibilityLabel={def.label}
              value={edits[def.id] ?? def.label}
              onChangeText={(value) =>
                setEdits((s) => ({ ...s, [def.id]: value }))
              }
              onEndEditing={() => rename(def.id, def.label)}
              maxLength={FIELD_NAME_MAX_LENGTH}
              menuLabel={i18n.t('moreActionsFor', { name: def.label })}
              menuActions={[
                {
                  id: 'archive-field',
                  title: i18n.t('archiveField'),
                  systemImage: 'archivebox',
                  destructive: true,
                  onPress: () => confirmArchive(def.id, def.label),
                },
              ]}
            />
          )}
        </GroupedListReorderSection>
      )}

      {archivedDefs.length > 0 && (
        <GroupedListSection
          title={i18n.t('archived')}
          footer={i18n.t('archivedConversationFields_description')}
        >
          {archivedDefs.map((def) => (
            <GroupedListRow
              key={def.id}
              label={def.label}
              menuLabel={i18n.t('moreActionsFor', { name: def.label })}
              menuActions={[
                {
                  id: 'restore-field',
                  title: i18n.t('restore'),
                  systemImage: 'arrow.uturn.backward',
                  onPress: () => restoreConversationFieldDef(def.id),
                },
                {
                  id: 'delete-field',
                  title: i18n.t('delete'),
                  systemImage: 'trash',
                  destructive: true,
                  onPress: () => confirmPermanentDelete(def.id, def.label),
                },
              ]}
            />
          ))}
        </GroupedListSection>
      )}
    </GroupedList>
  )
}

export default PreferencesConversationFieldsScreen
