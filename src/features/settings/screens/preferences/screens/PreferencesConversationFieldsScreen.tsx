import CustomFieldPrivacyWarning from '@/components/CustomFieldPrivacyWarning'
import { analytics } from '@/lib/analytics'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import ReorderControls from '@/components/ui/ReorderControls'
import {
  Archive as ArchiveIcon,
  RotateCcw as RotateCcwIcon,
  Trash2 as TrashIcon,
} from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'
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
import useConversations from '@/stores/conversationStore'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import { activeCustomFieldDefs } from '@/lib/customFields'

/**
 * Manages the custom fields shown on the conversation form (e.g.
 * "Publication"). Mirrors the contact fields screen, without the built-in phone
 * and email rows.
 */
const PreferencesConversationFieldsScreen = () => {
  const theme = useTheme()
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

  // Local rename state per def — keyed by id, holds the in-progress edit value
  // until the user commits via blur.
  const [edits, setEdits] = useState<Record<string, string>>({})

  const activeDefs = activeCustomFieldDefs(conversationFieldDefs)
  const archivedDefs = conversationFieldDefs
    .filter((d) => d.archived)
    .sort((a, b) => a.order - b.order)

  const handleAdd = () => {
    if (!newFieldName.trim()) return
    addConversationFieldDef(newFieldName)
    analytics.capture('custom_field_created', { scope: 'conversation' })
    setNewFieldName('')
  }

  const move = (idx: number, direction: -1 | 1) => {
    const target = idx + direction
    if (target < 0 || target >= activeDefs.length) return
    const next = activeDefs.map((def) => def.id)
    ;[next[idx], next[target]] = [next[target], next[idx]]
    reorderConversationFieldDefs(next)
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
                  placeholder={i18n.t('conversationField_placeholder')}
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
            <CustomFieldPrivacyWarning texts={[newFieldName]} />
          </View>

          {activeDefs.length > 0 && (
            <View style={{ gap: 5 }}>
              <SectionTitle text={i18n.t('active')} />
              <Section>
                {activeDefs.map((def, idx) => {
                  const last = idx === activeDefs.length - 1
                  const value = edits[def.id] ?? def.label
                  return (
                    <View key={def.id}>
                      <InputRowContainer
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
                          onMoveUp={idx === 0 ? undefined : () => move(idx, -1)}
                          onMoveDown={last ? undefined : () => move(idx, 1)}
                        />
                        <MyTextInput
                          value={value}
                          onChangeText={(v: string) =>
                            setEdits((s) => ({ ...s, [def.id]: v }))
                          }
                          onEndEditing={() => {
                            const trimmed = value.trim()
                            if (trimmed && trimmed !== def.label) {
                              renameConversationFieldDef(def.id, trimmed)
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
                      <CustomFieldPrivacyWarning texts={[value]} />
                    </View>
                  )
                })}
              </Section>
            </View>
          )}

          {archivedDefs.length > 0 && (
            <View style={{ gap: 5 }}>
              <SectionTitle
                text={i18n.t('archived')}
                info={i18n.t('archivedConversationFields_description')}
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
                          onPress: () => {
                            restoreConversationFieldDef(def.id)
                          },
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

export default PreferencesConversationFieldsScreen
