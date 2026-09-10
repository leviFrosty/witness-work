import { getContactInformationFields } from '@/lib/contactInformationFields'
import { usePreferences } from '@/stores/preferences'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import ReorderControls from '@/features/settings/components/shared/ReorderControls'
import {
  Archive as ArchiveIcon,
  RotateCcw as RotateCcwIcon,
  Trash2 as TrashIcon,
} from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Switch, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import ActionButton from '@/components/ui/ActionButton'
import MyTextInput from '@/components/ui/TextInput'
import Text from '@/components/ui/MyText'
import RowActionsMenu from '@/components/RowActionsMenu'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import confirmDestructive from '@/lib/confirmDestructive'
import useContacts from '@/stores/contactsStore'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

const PreferencesCustomFieldsScreen = () => {
  const theme = useTheme()
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

  // Local rename state per def — keyed by id, holds the in-progress edit value
  // until the user commits via blur. Falls back to the stored label when
  // unedited so existing labels render correctly on first paint.
  const [edits, setEdits] = useState<Record<string, string>>({})

  const { contactInformationOrder, showContactPhone, showContactEmail, set } =
    usePreferences()
  const activeFields = getContactInformationFields(
    customFieldDefs,
    contactInformationOrder
  )
  const archivedDefs = useMemo(
    () =>
      [...customFieldDefs]
        .filter((d) => d.archived)
        .sort((a, b) => a.order - b.order),
    [customFieldDefs]
  )

  const handleAdd = () => {
    if (!newFieldName.trim()) return
    addCustomFieldDef(newFieldName)
    setNewFieldName('')
  }

  const move = (id: string, direction: -1 | 1) => {
    const idx = activeFields.findIndex((field) => field.id === id)
    if (idx < 0) return
    const target = idx + direction
    if (target < 0 || target >= activeFields.length) return
    const next = activeFields.map((field) => field.id)
    ;[next[idx], next[target]] = [next[target], next[idx]]
    set({ contactInformationOrder: next })
    reorderCustomFieldDefs(
      getContactInformationFields(customFieldDefs, next).flatMap((field) =>
        field.kind === 'custom' ? [field.definition.id] : []
      )
    )
  }

  const confirmArchive = (id: string, label: string) => {
    confirmDestructive({
      title: i18n.t('archiveField'),
      description: i18n.t('archiveField_description', { label }),
      confirmLabel: i18n.t('archive'),
      onConfirm: () => archiveCustomFieldDef(id),
    })
  }

  const confirmPermanentDelete = (id: string, label: string) => {
    confirmDestructive({
      title: i18n.t('permanentlyDelete'),
      description: i18n.t('permanentlyDeleteCustomField_warning', { label }),
      confirmLabel: i18n.t('delete'),
      onConfirm: () => purgeCustomFieldDef(id),
    })
  }

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <KeyboardAwareScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <View style={{ paddingHorizontal: 12 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('lg'),
              }}
            >
              {i18n.t('manageContactFields')}
            </Text>
          </View>

          <View style={{ gap: 5 }}>
            <SectionTitle text={i18n.t('addNewField')} />
            <Section>
              <InputRowContainer
                lastInSection
                controlWidth='full'
                style={{ flexDirection: 'row', alignItems: 'center' }}
                controlStyle={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <MyTextInput
                  placeholder={i18n.t('customField_placeholder')}
                  value={newFieldName}
                  onChangeText={setNewFieldName}
                  autoCapitalize='words'
                  maxLength={14}
                  textAlign='left'
                  style={{ flex: 1 }}
                />
                <ActionButton
                  disabled={!newFieldName.trim().length}
                  onPress={handleAdd}
                >
                  <Text style={{ color: theme.colors.textInverse }}>
                    {i18n.t('add')}
                  </Text>
                </ActionButton>
              </InputRowContainer>
            </Section>
          </View>

          <View style={{ gap: 5 }}>
            <SectionTitle text={i18n.t('active')} />
            <Section>
              {activeFields.map((field, idx) => {
                const last = idx === activeFields.length - 1
                if (field.kind !== 'custom') {
                  const label = i18n.t(field.kind)
                  return (
                    <InputRowContainer
                      key={field.id}
                      lastInSection={last}
                      controlWidth='full'
                      controlStyle={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <ReorderControls
                        onMoveUp={
                          idx === 0 ? undefined : () => move(field.id, -1)
                        }
                        onMoveDown={last ? undefined : () => move(field.id, 1)}
                      />
                      <Text style={{ flex: 1, minWidth: 0 }}>{label}</Text>
                      <Switch
                        accessibilityLabel={label}
                        value={
                          field.kind === 'phone'
                            ? showContactPhone
                            : showContactEmail
                        }
                        onValueChange={(value) =>
                          set(
                            field.kind === 'phone'
                              ? { showContactPhone: value }
                              : { showContactEmail: value }
                          )
                        }
                      />
                    </InputRowContainer>
                  )
                }
                const def = field.definition
                const value = edits[def.id] ?? def.label
                return (
                  <InputRowContainer
                    key={def.id}
                    lastInSection={last}
                    controlWidth='full'
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    controlStyle={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <ReorderControls
                      onMoveUp={
                        idx === 0 ? undefined : () => move(field.id, -1)
                      }
                      onMoveDown={last ? undefined : () => move(field.id, 1)}
                    />
                    <MyTextInput
                      value={value}
                      onChangeText={(v: string) =>
                        setEdits((s) => ({ ...s, [def.id]: v }))
                      }
                      onEndEditing={() => {
                        const trimmed = value.trim()
                        if (trimmed && trimmed !== def.label) {
                          renameCustomFieldDef(def.id, trimmed)
                        }
                        // Clear local edit so future label changes from
                        // sync show through.
                        setEdits((s) => {
                          const next = { ...s }
                          delete next[def.id]
                          return next
                        })
                      }}
                      autoCapitalize='words'
                      maxLength={14}
                      textAlign='left'
                      style={{ flex: 1 }}
                    />
                    <RowActionsMenu
                      accessibilityLabel={i18n.t('moreActionsFor', {
                        name: def.label,
                      })}
                      actions={[
                        {
                          id: 'archive-field',
                          label: i18n.t('archiveField'),
                          icon: ArchiveIcon,
                          destructive: true,
                          onPress: () => confirmArchive(def.id, def.label),
                        },
                      ]}
                    />
                  </InputRowContainer>
                )
              })}
            </Section>
          </View>

          {archivedDefs.length > 0 && (
            <View style={{ gap: 5 }}>
              <SectionTitle
                text={i18n.t('archived')}
                info={i18n.t('archivedFields_description')}
              />
              <Section>
                {archivedDefs.map((def, idx) => (
                  <InputRowContainer
                    key={def.id}
                    lastInSection={idx === archivedDefs.length - 1}
                    label={def.label}
                    controlWidth='auto'
                  >
                    <RowActionsMenu
                      accessibilityLabel={i18n.t('moreActionsFor', {
                        name: def.label,
                      })}
                      actions={[
                        {
                          id: 'restore-field',
                          label: i18n.t('restore'),
                          icon: RotateCcwIcon,
                          onPress: () => restoreCustomFieldDef(def.id),
                        },
                        {
                          id: 'delete-field',
                          label: i18n.t('delete'),
                          icon: TrashIcon,
                          destructive: true,
                          onPress: () =>
                            confirmPermanentDelete(def.id, def.label),
                        },
                      ]}
                    />
                  </InputRowContainer>
                ))}
              </Section>
            </View>
          )}
        </KeyboardAwareScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesCustomFieldsScreen
