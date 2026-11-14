import useFormValidation from '@/hooks/useFormValidation'
import { useCustomFieldPrivacyNote } from '@/components/CustomFieldPrivacyWarning'
import { analytics } from '@/lib/analytics'
import { getContactInformationFields } from '@/lib/contactInformationFields'
import { usePreferences } from '@/stores/preferences'
import { useState } from 'react'
import {
  GroupedList,
  GroupedListReorderSection,
  GroupedListRow,
  GroupedListSection,
  GroupedListSwitchRow,
  GroupedListTextFieldRow,
} from '@/components/ui/GroupedList'
import { moveItem } from '@/lib/reorder'
import i18n from '@/lib/locales'
import confirmDestructive from '@/lib/confirmDestructive'
import useContacts from '@/stores/contactsStore'

const FIELD_NAME_MAX_LENGTH = 14

const PreferencesCustomFieldsScreen = () => {
  const {
    customFieldDefs,
    addCustomFieldDef,
    renameCustomFieldDef,
    reorderCustomFieldDefs,
    archiveCustomFieldDef,
    restoreCustomFieldDef,
    purgeCustomFieldDef,
  } = useContacts()

  const [newFieldName, setNewFieldName] = useState('')
  const validation = useFormValidation(
    { name: !newFieldName.trim() },
    'custom_field'
  )

  const [edits, setEdits] = useState<Record<string, string>>({})

  const { contactInformationOrder, showContactPhone, showContactEmail, set } =
    usePreferences()
  const activeFields = getContactInformationFields(
    customFieldDefs,
    contactInformationOrder
  )
  const archivedDefs = customFieldDefs
    .filter((d) => d.archived)
    .sort((a, b) => a.order - b.order)

  const newFieldNote = useCustomFieldPrivacyNote([newFieldName])
  const activeNote = useCustomFieldPrivacyNote(Object.values(edits))

  const handleAdd = () => {
    if (!validation.validate()) return
    addCustomFieldDef(newFieldName)
    analytics.capture('custom_field_created', { scope: 'contact' })
    setNewFieldName('')
  }

  const move = (from: number, to: number) => {
    const next = moveItem(
      activeFields.map((field) => field.id),
      from,
      to
    )
    set({ contactInformationOrder: next })
    reorderCustomFieldDefs(
      getContactInformationFields(customFieldDefs, next).flatMap((field) =>
        field.kind === 'custom' ? [field.definition.id] : []
      )
    )
  }

  const rename = (id: string, label: string) => {
    const value = edits[id]
    const trimmed = value?.trim()
    if (trimmed && trimmed !== label) renameCustomFieldDef(id, trimmed)
    setEdits((s) => {
      const next = { ...s }
      delete next[id]
      return next
    })
  }

  const confirmArchive = (id: string, label: string) => {
    confirmDestructive({
      title: i18n.t('archiveField'),
      description: i18n.t('archiveField_description', { label }),
      confirmLabel: i18n.t('archive'),
      onConfirm: () => {
        archiveCustomFieldDef(id)
      },
    })
  }

  const confirmPermanentDelete = (id: string, label: string) => {
    confirmDestructive({
      title: i18n.t('permanentlyDelete'),
      description: i18n.t('permanentlyDeleteCustomField_warning', { label }),
      confirmLabel: i18n.t('delete'),
      onConfirm: () => {
        purgeCustomFieldDef(id)
      },
    })
  }

  return (
    <GroupedList title={i18n.t('manageContactFields')} editing>
      <GroupedListSection title={i18n.t('addNewField')} footer={newFieldNote}>
        <GroupedListTextFieldRow
          accessibilityLabel={i18n.t('addNewField')}
          placeholder={i18n.t('customField_placeholder')}
          invalid={validation.invalid('name')}
          value={newFieldName}
          onChangeText={setNewFieldName}
          maxLength={FIELD_NAME_MAX_LENGTH}
          action={{ label: i18n.t('add'), onPress: handleAdd }}
        />
      </GroupedListSection>

      <GroupedListReorderSection
        title={i18n.t('active')}
        footer={activeNote}
        data={activeFields}
        keyExtractor={(field) => field.id}
        onMove={move}
      >
        {(field) => {
          if (field.kind !== 'custom') {
            const phone = field.kind === 'phone'
            return (
              <GroupedListSwitchRow
                label={i18n.t(field.kind)}
                value={phone ? showContactPhone : showContactEmail}
                onValueChange={(value) =>
                  set(
                    phone
                      ? { showContactPhone: value }
                      : { showContactEmail: value }
                  )
                }
              />
            )
          }
          const def = field.definition
          return (
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
          )
        }}
      </GroupedListReorderSection>

      {archivedDefs.length > 0 && (
        <GroupedListSection
          title={i18n.t('archived')}
          footer={i18n.t('archivedFields_description')}
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
                  onPress: () => restoreCustomFieldDef(def.id),
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

export default PreferencesCustomFieldsScreen
