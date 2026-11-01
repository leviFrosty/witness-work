import useFormValidation from '@/hooks/useFormValidation'
import InfoPopover from '@/components/ui/InfoPopover'
import type { InputRef } from 'tamagui'
import { useRef, useState } from 'react'
import {
  StyleProp,
  TextInput as NativeTextInput,
  View,
  ViewStyle,
} from 'react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import Switch from '@/components/ui/Switch'
import * as Crypto from 'expo-crypto'

import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Select from '@/components/ui/Select'
import TextInput from '@/components/ui/TextInput'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import confirmDestructive from '@/lib/confirmDestructive'
import useCategories from '@/stores/categories'
import useServiceReport from '@/stores/serviceReport'
import { restampTimeEntriesCredit } from '@/lib/categories'
import { Category } from '@/types/category'
import {
  LDC_BUILTIN_CATEGORY_ID,
  STANDARD_CATEGORY_ID,
} from '@/constants/categories'

export const STANDARD_TYPE_VALUE = STANDARD_CATEGORY_ID
export const CUSTOM_TYPE_VALUE = '__custom__'

export type TypeSelection = {
  value: string

  category: Category | null
}

type Props = {
  value: string

  onChange: (selection: TypeSelection) => void
  invalid?: boolean
  lastInSection?: boolean

  leftIcon?: AppIcon
  style?: StyleProp<ViewStyle>

  onCustomNameFocus?: () => void
}

const TypeSelectorRow = ({
  value,
  onChange,
  invalid,
  lastInSection,
  leftIcon,
  style,
  onCustomNameFocus,
}: Props) => {
  const theme = useTheme()
  const { categories, addCategory, updateCategory, deleteCategory } =
    useCategories()
  const setServiceReportStore = useServiceReport((s) => s.set)

  const [customCategoryName, setCustomCategoryName] = useState<string>('')
  const validation = useFormValidation(
    { name: !customCategoryName.trim() },
    'category',
    value === CUSTOM_TYPE_VALUE
  )
  const customNameInput = useRef<InputRef>(null)

  const addOnBlur = useRef(false)

  const selectedCategory: Category | null =
    value === STANDARD_TYPE_VALUE || value === CUSTOM_TYPE_VALUE
      ? null
      : (categories.find((c) => c.id === value) ?? null)

  const handleSelect = (nextValue: string) => {
    if (nextValue === STANDARD_TYPE_VALUE || nextValue === CUSTOM_TYPE_VALUE) {
      onChange({ value: nextValue, category: null })
      return
    }

    const category = categories.find((c) => c.id === nextValue)
    if (!category) return
    onChange({ value: nextValue, category })
  }

  const setCategoryIsCredit = (isCredit: boolean) => {
    if (!selectedCategory) return
    updateCategory({ id: selectedCategory.id, isCredit })
    onChange({
      value: selectedCategory.id,
      category: { ...selectedCategory, isCredit },
    })

    const restamped = restampTimeEntriesCredit(
      useServiceReport.getState().serviceReports,
      selectedCategory.id,
      isCredit
    )
    if (restamped.changed) {
      setServiceReportStore({ serviceReports: restamped.serviceReports })
    }
  }

  const addCustomCategory = () => {
    const trimmed = customCategoryName.trim()
    if (!validation.validate()) return

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

  const handleAddCustomCategory = () => {
    if (!validation.validate()) return

    const input = customNameInput.current as unknown as NativeTextInput | null

    if (input?.isFocused()) {
      addOnBlur.current = true
      input.blur()
      return
    }
    addCustomCategory()
  }

  const handleDeleteCurrentCategory = () => {
    if (!selectedCategory) return
    const category = selectedCategory
    confirmDestructive({
      title: i18n.t('removeCategory_title', { name: category.name }),
      description: i18n.t('removeCategory_description'),
      confirmLabel: i18n.t('removeCategory'),
      onConfirm: () => {
        deleteCategory(category.id)
        onChange({ value: STANDARD_TYPE_VALUE, category: null })
      },
    })
  }

  type TypeOption = { label: string; value: string }

  const userCategories = categories.filter(
    (c) => c.id !== LDC_BUILTIN_CATEGORY_ID
  )
  const typeOptions: TypeOption[] = [
    { label: i18n.t('standard'), value: STANDARD_TYPE_VALUE },
    { label: i18n.t('ldc'), value: LDC_BUILTIN_CATEGORY_ID },
    ...userCategories.map((c) => ({
      label: i18n.t(c.name as TranslationKey, { defaultValue: c.name }),
      value: c.id,
    })),
    { label: i18n.t('custom'), value: CUSTOM_TYPE_VALUE },
  ]

  const hasDetails =
    value === CUSTOM_TYPE_VALUE ||
    Boolean(selectedCategory && !selectedCategory.builtin)

  return (
    <>
      <InputRowContainer
        label={i18n.t('type')}
        leftIcon={leftIcon}
        style={style}
        lastInSection={!hasDetails && lastInSection}
        justifyContent='space-between'
      >
        <Select
          data={typeOptions}
          onChange={({ value: c }) => handleSelect(c)}
          value={value}
        />
      </InputRowContainer>

      {value === CUSTOM_TYPE_VALUE ? (
        <InputRowContainer
          controlWidth='full'
          lastInSection={lastInSection}
          style={{ gap: 8 }}
          controlStyle={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
        >
          <View style={{ flex: 1, flexGrow: 1 }}>
            <TextInput
              invalid={invalid || validation.invalid('name')}
              maxLength={20}
              style={{
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: theme.numbers.borderRadiusSm,
                paddingVertical: 15,
                paddingHorizontal: 10,
                color: theme.colors.text,
              }}
              ref={customNameInput}
              onChangeText={(c) => setCustomCategoryName(c)}
              onFocus={onCustomNameFocus}
              onBlur={() => {
                if (!addOnBlur.current) return
                addOnBlur.current = false
                addCustomCategory()
              }}
              value={customCategoryName}
              placeholder={i18n.t('enterCustomCategory')}
            />
          </View>
          <Button
            style={{
              backgroundColor: theme.colors.accent,
              borderRadius: theme.numbers.borderRadiusSm,
              paddingVertical: 15,
            }}
            variant='outline'
            onPress={handleAddCustomCategory}
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
        </InputRowContainer>
      ) : selectedCategory && !selectedCategory.builtin ? (
        <InputRowContainer
          controlWidth='full'
          lastInSection={lastInSection}
          style={{ gap: 5 }}
        >
          <View style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                flexShrink: 1,
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flexShrink: 1,
                }}
              >
                <Text
                  style={{
                    flexShrink: 1,
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('lg'),
                  }}
                >
                  {i18n.t('credit')}
                </Text>
                <InfoPopover
                  title={i18n.t('credit')}
                  description={i18n.t('credit_description')}
                />
              </View>
              <Switch
                accessibilityLabel={i18n.t('credit')}
                value={selectedCategory.isCredit}
                onValueChange={(val) => setCategoryIsCredit(val)}
              />
            </View>
          </View>
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
        </InputRowContainer>
      ) : null}
    </>
  )
}

export default TypeSelectorRow
