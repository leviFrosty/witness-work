import {
  ArrowDown as ArrowDownIcon,
  ArrowUp as ArrowUpIcon,
  Minus as MinusIcon,
  RotateCcw as RotateCcwIcon,
} from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Alert, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import ActionButton from '@/components/ui/ActionButton'
import IconButton from '@/components/ui/IconButton'
import MyTextInput from '@/components/ui/TextInput'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'

const PreferencesCustomFieldsScreen = () => {
  const theme = useTheme()
  const {
    customFieldDefs,
    addCustomFieldDef,
    renameCustomFieldDef,
    reorderCustomFieldDefs,
    archiveCustomFieldDef,
    restoreCustomFieldDef,
  } = useContacts()

  const [newFieldName, setNewFieldName] = useState('')

  // Local rename state per def — keyed by id, holds the in-progress edit value
  // until the user commits via blur. Falls back to the stored label when
  // unedited so existing labels render correctly on first paint.
  const [edits, setEdits] = useState<Record<string, string>>({})

  const activeDefs = useMemo(
    () =>
      [...customFieldDefs]
        .filter((d) => !d.archived)
        .sort((a, b) => a.order - b.order),
    [customFieldDefs]
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
    const idx = activeDefs.findIndex((d) => d.id === id)
    if (idx < 0) return
    const target = idx + direction
    if (target < 0 || target >= activeDefs.length) return
    const next = activeDefs.map((d) => d.id)
    ;[next[idx], next[target]] = [next[target], next[idx]]
    reorderCustomFieldDefs(next)
  }

  const confirmArchive = (id: string, label: string) => {
    Alert.alert(
      i18n.t('archiveField'),
      i18n.t('archiveField_description', { label }),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('archive'),
          style: 'destructive',
          onPress: () => archiveCustomFieldDef(id),
        },
      ]
    )
  }

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
      >
        <View style={{ paddingHorizontal: 20, gap: 6 }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('lg'),
            }}
          >
            {i18n.t('manageCustomFields')}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('manageCustomFields_description')}
          </Text>
        </View>

        <View style={{ gap: 5 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              paddingLeft: 20,
            }}
          >
            {i18n.t('active')}
          </Text>
          <Section>
            {activeDefs.length === 0 && (
              <InputRowContainer lastInSection>
                <Text style={{ color: theme.colors.textAlt }}>
                  {i18n.t('customFields_empty')}
                </Text>
              </InputRowContainer>
            )}
            {activeDefs.map((def, idx) => {
              const last = idx === activeDefs.length - 1
              const value = edits[def.id] ?? def.label
              return (
                <InputRowContainer
                  key={def.id}
                  lastInSection={last}
                  style={{ alignItems: 'center', gap: 6 }}
                >
                  <IconButton
                    icon={ArrowUpIcon}
                    onPress={idx === 0 ? undefined : () => move(def.id, -1)}
                    color={
                      idx === 0 ? theme.colors.border : theme.colors.textAlt
                    }
                  />
                  <IconButton
                    icon={ArrowDownIcon}
                    onPress={
                      idx === activeDefs.length - 1
                        ? undefined
                        : () => move(def.id, 1)
                    }
                    color={
                      idx === activeDefs.length - 1
                        ? theme.colors.border
                        : theme.colors.textAlt
                    }
                  />
                  <View style={{ flex: 1 }}>
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
                      style={{
                        color: theme.colors.text,
                        padding: 3,
                      }}
                      hitSlop={{ top: 20, bottom: 20 }}
                    />
                  </View>
                  <IconButton
                    icon={MinusIcon}
                    color={theme.colors.error}
                    onPress={() => confirmArchive(def.id, def.label)}
                  />
                </InputRowContainer>
              )
            })}
          </Section>
        </View>

        {archivedDefs.length > 0 && (
          <View style={{ gap: 5 }}>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
                paddingLeft: 20,
              }}
            >
              {i18n.t('archived')}
            </Text>
            <Section>
              {archivedDefs.map((def, idx) => (
                <InputRowContainer
                  key={def.id}
                  lastInSection={idx === archivedDefs.length - 1}
                  style={{
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ color: theme.colors.textAlt }}>
                    {def.label}
                  </Text>
                  <IconButton
                    icon={RotateCcwIcon}
                    color={theme.colors.accent}
                    onPress={() => restoreCustomFieldDef(def.id)}
                  />
                </InputRowContainer>
              ))}
            </Section>
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
                paddingHorizontal: 20,
              }}
            >
              {i18n.t('archivedFields_description')}
            </Text>
          </View>
        )}

        <View style={{ gap: 5 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              paddingLeft: 20,
            }}
          >
            {i18n.t('addNewField')}
          </Text>
          <Section>
            <InputRowContainer lastInSection style={{ alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <MyTextInput
                  placeholder={i18n.t('customField_placeholder')}
                  value={newFieldName}
                  onChangeText={setNewFieldName}
                  autoCapitalize='words'
                  maxLength={14}
                  style={{ color: theme.colors.text, padding: 3 }}
                  hitSlop={{ top: 20, bottom: 20 }}
                />
              </View>
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
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default PreferencesCustomFieldsScreen
