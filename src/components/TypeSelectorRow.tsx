import { useState } from 'react'
import { Switch, View } from 'react-native'
import * as Crypto from 'expo-crypto'

import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Select from '@/components/ui/Select'
import TextInput from '@/components/ui/TextInput'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import useCategories from '@/stores/categories'
import useServiceReport from '@/stores/serviceReport'
import usePublisher from '@/hooks/usePublisher'
import { restampTimeEntriesCredit } from '@/lib/categories'
import { Category } from '@/types/category'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'

/**
 * Synthetic select values for the two preset entry types that don't correspond
 * to a real Category record. Real categories use their UUID as the value. LDC
 * is no longer synthetic — it's the LDC builtin Category (see
 * `LDC_BUILTIN_CATEGORY_ID`), surfaced alongside these presets.
 */
export const STANDARD_TYPE_VALUE = '__standard__'
export const CUSTOM_TYPE_VALUE = '__custom__'

export type TypeSelection = {
  /**
   * Picker value: `STANDARD_TYPE_VALUE`, `CUSTOM_TYPE_VALUE`, or a Category id
   * (including the LDC builtin).
   */
  value: string
  /**
   * Resolved Category record for the selection, or null for the synthetic
   * presets. On a Credit-switch flip this carries the updated `isCredit`.
   */
  category: Category | null
}

type Props = {
  /** Controlled picker value — see `TypeSelection.value`. */
  value: string
  /**
   * Fires on every selection change: picking a preset/Category, creating a
   * custom Category, deleting the current one, or flipping its Credit switch.
   */
  onChange: (selection: TypeSelection) => void
  lastInSection?: boolean
}

/**
 * The "Type" form row shared by the Add Time screen and the Plan Day screen: a
 * Standard / LDC / user-Category / Custom picker with inline custom-Category
 * creation, the Credit switch, and Category deletion. The row owns the
 * Category-store mutations; the host screen only maps the reported
 * `TypeSelection` onto whatever record it is editing (a Time Entry's
 * `categoryId` + legacy `credit` stamp, or a Plan's derive-only `categoryId`).
 */
const TypeSelectorRow = ({ value, onChange, lastInSection }: Props) => {
  const theme = useTheme()
  const { categories, addCategory, updateCategory, deleteCategory } =
    useCategories()
  const { hasAnnualGoal } = usePublisher()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const setServiceReportStore = useServiceReport((s) => s.set)

  const [customCategoryName, setCustomCategoryName] = useState<string>('')

  // The Category currently in focus. Null when one of the synthetic preset
  // values (Standard / Custom) is selected; non-null for a real Category id
  // including the LDC builtin.
  const selectedCategory: Category | null =
    value === STANDARD_TYPE_VALUE || value === CUSTOM_TYPE_VALUE
      ? null
      : (categories.find((c) => c.id === value) ?? null)

  const handleSelect = (nextValue: string) => {
    if (nextValue === STANDARD_TYPE_VALUE || nextValue === CUSTOM_TYPE_VALUE) {
      onChange({ value: nextValue, category: null })
      return
    }
    // A real Category id (user-created OR the LDC builtin).
    const category = categories.find((c) => c.id === nextValue)
    if (!category) return
    onChange({ value: nextValue, category })
  }

  /**
   * Flips `isCredit` on the currently-selected Category record and re-stamps
   * `credit` on every TimeEntry that references it (see
   * `restampTimeEntriesCredit` for the why). Skips the store write entirely
   * when no entry references the Category — flipping a freshly-created custom
   * Category is a no-op on the reports.
   */
  const setCategoryIsCredit = (isCredit: boolean) => {
    if (!selectedCategory) return
    updateCategory({ id: selectedCategory.id, isCredit })
    onChange({
      value: selectedCategory.id,
      category: { ...selectedCategory, isCredit },
    })

    const restamped = restampTimeEntriesCredit(
      serviceReports,
      selectedCategory.id,
      isCredit
    )
    if (restamped.changed) {
      setServiceReportStore({ serviceReports: restamped.serviceReports })
    }
  }

  const handleAddCustomCategory = () => {
    const trimmed = customCategoryName.trim()
    if (!trimmed) return
    // Reuse an existing Category if the name matches (case-sensitive, mirrors
    // the rest of the app); otherwise create a new record.
    let target = categories.find((c) => c.name === trimmed)
    if (!target) {
      const newCategory: Category = {
        id: Crypto.randomUUID(),
        name: trimmed,
        isCredit: false,
      }
      addCategory(newCategory)
      target = newCategory
    }
    onChange({ value: target.id, category: target })
    setCustomCategoryName('')
  }

  const handleDeleteCurrentCategory = () => {
    if (!selectedCategory) return
    deleteCategory(selectedCategory.id)
    onChange({ value: STANDARD_TYPE_VALUE, category: null })
  }

  type TypeOption = { label: string; value: string }
  // LDC is technically a Category record now (the builtin), but we still
  // surface it as a preset slot above the user's own categories — it's the
  // most common credit-bearing entry type and worth a stable position in the
  // picker. Strip it from the user-categories spread so it doesn't appear
  // twice.
  const userCategories = categories.filter(
    (c) => c.id !== LDC_BUILTIN_CATEGORY_ID
  )
  const typeOptions: TypeOption[] = [
    { label: i18n.t('standard'), value: STANDARD_TYPE_VALUE },
    { label: i18n.t('ldc'), value: LDC_BUILTIN_CATEGORY_ID },
    ...userCategories.map((c) => ({
      // Allow i18n on preset-translatable names (e.g. legacy English-locale
      // entries seeded from the migration); fall back to the stored name.
      label: i18n.t(c.name as TranslationKey, { defaultValue: c.name }),
      value: c.id,
    })),
    { label: i18n.t('custom'), value: CUSTOM_TYPE_VALUE },
  ]

  return (
    <InputRowContainer
      label={i18n.t('type')}
      lastInSection={lastInSection}
      justifyContent='space-between'
    >
      <View
        style={{
          gap: 5,
          width: '100%',
          flexShrink: 1,
        }}
      >
        <Select
          data={typeOptions}
          style={{ width: '100%', flex: 1 }}
          onChange={({ value: c }) => {
            handleSelect(c)
          }}
          value={value}
        />
        {value === CUSTOM_TYPE_VALUE ? (
          <View style={{ flexDirection: 'row', gap: 5 }}>
            <View style={{ flex: 1, flexGrow: 1 }}>
              <TextInput
                maxLength={20}
                style={{
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: theme.numbers.borderRadiusSm,
                  paddingVertical: 15,
                  paddingHorizontal: 10,
                  color: theme.colors.text,
                }}
                onChangeText={(c) => setCustomCategoryName(c)}
                value={customCategoryName}
                placeholder={i18n.t('enterCustomCategory')}
              />
            </View>
            <Button
              style={{
                backgroundColor:
                  customCategoryName.trim().length === 0
                    ? theme.colors.accentAlt
                    : theme.colors.accent,
                borderRadius: theme.numbers.borderRadiusSm,
                paddingVertical: 15,
              }}
              variant='outline'
              onPress={handleAddCustomCategory}
              disabled={customCategoryName.trim().length === 0}
            >
              <Text
                style={{
                  color: theme.colors.textInverse,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('add')}
              </Text>
            </Button>
          </View>
        ) : (
          selectedCategory && (
            <View
              style={{
                gap: 5,
                flexShrink: 1,
              }}
            >
              {/* Builtin Categories (LDC) own their `isCredit` value
                  and can't be renamed or deleted — hide the Credit
                  toggle + remove button. The LDC builtin is always
                  credit-bearing by definition. */}
              {hasAnnualGoal && !selectedCategory.builtin && (
                <View
                  style={{
                    borderWidth: 1,
                    borderRadius: theme.numbers.borderRadiusSm,
                    padding: 10,
                    borderColor: theme.colors.border,
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      flexShrink: 1,
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: theme.fonts.semiBold,
                        fontSize: theme.fontSize('lg'),
                      }}
                    >
                      {i18n.t('credit')}
                    </Text>
                    <Switch
                      value={selectedCategory.isCredit}
                      onValueChange={(val) => setCategoryIsCredit(val)}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: theme.fontSize('sm'),
                      color: theme.colors.textAlt,
                    }}
                  >
                    {i18n.t('credit_description')}
                  </Text>
                </View>
              )}
              {!selectedCategory.builtin && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                  }}
                >
                  <Button onPress={handleDeleteCurrentCategory}>
                    <Text
                      style={{
                        color: theme.colors.textAlt,
                        textDecorationLine: 'underline',
                      }}
                    >
                      {i18n.t('removeCategory')}
                    </Text>
                  </Button>
                </View>
              )}
            </View>
          )
        )}
      </View>
    </InputRowContainer>
  )
}

export default TypeSelectorRow
