import { useRef, useState } from 'react'
import { Alert, ScrollView, TextInput as RNTextInput, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useMileage from '@/stores/mileage'

export default function MileageCategoryManager() {
  const theme = useTheme()
  const {
    categories,
    entries,
    addCategory,
    updateCategory,
    deleteCategory,
    archiveCategory,
    restoreCategory,
  } = useMileage()
  const [editingId, setEditingId] = useState<string>()
  const [name, setName] = useState('')
  const scroll = useRef<ScrollView>(null)
  const input = useRef<RNTextInput>(null)
  const edit = (id: string, name: string) => {
    setEditingId(id)
    setName(name)
    scroll.current?.scrollTo({ y: 0, animated: true })
    input.current?.focus()
  }
  const save = () => {
    if (!name.trim()) return
    if (editingId) updateCategory({ id: editingId, name })
    else
      addCategory({
        id: Crypto.randomUUID(),
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    setName('')
    setEditingId(undefined)
  }
  const remove = (id: string) =>
    Alert.alert(
      i18n.t('mileage.categories.deleteTitle'),
      i18n.t('mileage.categories.deleteDescription'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('delete'),
          style: 'destructive',
          onPress: () => {
            deleteCategory(id)
            if (editingId === id) {
              setEditingId(undefined)
              setName('')
            }
          },
        },
      ]
    )
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      ref={scroll}
      contentContainerStyle={{ padding: 20, gap: 24 }}
      keyboardShouldPersistTaps='handled'
    >
      <Text style={{ fontSize: 24, fontFamily: theme.fonts.bold }}>
        {i18n.t('mileage.categories.title')}
      </Text>
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('mileage.categories.description')}
      </Text>
      <Section>
        <TextInputRow
          ref={input}
          label={i18n.t('mileage.categories.name')}
          lastInSection
          textInputProps={{
            value: name,
            onChangeText: setName,
            maxLength: 100,
          }}
        />
      </Section>
      <ActionButton onPress={save} disabled={!name.trim()}>
        {i18n.t(editingId ? 'save' : 'mileage.categories.add')}
      </ActionButton>
      {editingId && (
        <Button
          onPress={() => {
            setEditingId(undefined)
            setName('')
          }}
        >
          <Text>{i18n.t('mileage.categories.new')}</Text>
        </Button>
      )}
      {!categories.length && (
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('mileage.categories.empty')}
        </Text>
      )}
      {[false, true].map((archived) => (
        <View key={String(archived)} style={{ gap: 12 }}>
          {categories.some(
            (category) => (category.archivedAt !== undefined) === archived
          ) && (
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {i18n.t(
                archived ? 'mileage.common.archived' : 'mileage.common.active'
              )}
            </Text>
          )}
          {categories
            .filter(
              (category) => (category.archivedAt !== undefined) === archived
            )
            .map((category) => (
              <View
                key={category.id}
                style={{
                  padding: 16,
                  gap: 14,
                  backgroundColor: theme.colors.card,
                  borderRadius: theme.numbers.borderRadiusSm,
                }}
              >
                <Button
                  onPress={() => {
                    edit(category.id, category.name)
                  }}
                >
                  <Text style={{ fontFamily: theme.fonts.semiBold }}>
                    {category.name}
                  </Text>
                </Button>
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}
                >
                  <Button
                    onPress={() => {
                      edit(category.id, category.name)
                    }}
                  >
                    <Text style={{ color: theme.colors.accent }}>
                      {i18n.t('mileage.common.rename')}
                    </Text>
                  </Button>
                  <Button
                    onPress={() =>
                      archived
                        ? restoreCategory(category.id)
                        : archiveCategory(category.id)
                    }
                  >
                    <Text style={{ color: theme.colors.accent }}>
                      {i18n.t(
                        archived
                          ? 'mileage.common.restore'
                          : 'mileage.common.archive'
                      )}
                    </Text>
                  </Button>
                  {!entries.some(
                    (entry) => entry.categoryId === category.id
                  ) && (
                    <Button onPress={() => remove(category.id)}>
                      <Text style={{ color: theme.colors.error }}>
                        {i18n.t('delete')}
                      </Text>
                    </Button>
                  )}
                </View>
              </View>
            ))}
        </View>
      ))}
    </ScrollView>
  )
}
