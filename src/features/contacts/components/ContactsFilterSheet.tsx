import useFormValidation from '@/hooks/useFormValidation'
import { X as XIcon } from 'lucide-react-native'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { InputProps } from 'tamagui'

import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  ActiveFilter,
  AddressKind,
  ComparableOperator,
  FOLLOW_UP_FILTER_KINDS,
  FollowUpFilterKind,
  IdentityKind,
  isFollowUpFilterKind,
  TextOperator,
} from '@/lib/contactsFilters'
import { ContactStaleness } from '@/lib/contactStaleness'
import { CustomFieldDefinition } from '@/types/customField'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Sheet from '@/components/ui/Sheet'
import Text from '@/components/ui/MyText'
import ChoiceChips, { ChoiceChip } from '@/components/ui/ChoiceChips'
import MyTextInput from '@/components/ui/TextInput'
import { tracking } from '@/lib/tracking'

export type ContactsFilterSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void

  initial?: ActiveFilter
  initialIndex?: number
  customFieldDefs: CustomFieldDefinition[]
  onSave: (filter: ActiveFilter, index: number | null) => void
}

type TextFieldKey = IdentityKind | AddressKind
type BooleanFieldKey = 'isFavorite' | 'hasStudy' | 'isActiveStudy'

type StaticFieldKey =
  | TextFieldKey
  | BooleanFieldKey
  | 'pinStaleness'
  | 'followUp'

type CustomFieldKey = `customField:${string}`

type FieldKey = StaticFieldKey | CustomFieldKey | null

const TEXT_FIELD_KEYS: TextFieldKey[] = [
  'name',
  'phone',
  'email',
  'city',
  'state',
  'zip',
]

const BOOLEAN_FIELD_KEYS: BooleanFieldKey[] = [
  'isFavorite',
  'hasStudy',
  'isActiveStudy',
]

const TEXT_OPERATORS: TextOperator[] = [
  'equals',
  'contains',
  'startsWith',
  'isSet',
  'notSet',
]

const COMPARABLE_OPERATORS: ComparableOperator[] = [
  'gt',
  'lt',
  'equals',
  'contains',
  'startsWith',
  'isSet',
  'notSet',
]

const PIN_STALENESS_VALUES: ContactStaleness[] = [
  'never',
  'recent',
  'week',
  'month',
]

const isBooleanField = (key: FieldKey): key is BooleanFieldKey =>
  key === 'isFavorite' || key === 'hasStudy' || key === 'isActiveStudy'

const isTextField = (key: FieldKey): key is TextFieldKey =>
  key !== null && (TEXT_FIELD_KEYS as string[]).includes(key as string)

const isCustomFieldKey = (key: FieldKey): key is CustomFieldKey =>
  typeof key === 'string' && key.startsWith('customField:')

const customFieldIdFromKey = (key: CustomFieldKey): string =>
  key.slice('customField:'.length)

const fieldKeyFromFilter = (filter: ActiveFilter): FieldKey => {
  switch (filter.kind) {
    case 'customField':
      return `customField:${filter.defId}` as CustomFieldKey
    case 'hasFollowUp':
    case 'noFollowUp':
    case 'followUpOverdue':
      return 'followUp'
    default:
      return filter.kind
  }
}

const fieldLabel = (
  key: Exclude<FieldKey, null>,
  customFieldDefs: CustomFieldDefinition[]
): string => {
  if (isCustomFieldKey(key)) {
    const def = customFieldDefs.find((d) => d.id === customFieldIdFromKey(key))
    return def?.label ?? i18n.t('contacts_field_customField')
  }
  switch (key) {
    case 'name':
      return i18n.t('contacts_field_name')
    case 'phone':
      return i18n.t('contacts_field_phone')
    case 'email':
      return i18n.t('contacts_field_email')
    case 'city':
      return i18n.t('contacts_field_city')
    case 'state':
      return i18n.t('contacts_field_state')
    case 'zip':
      return i18n.t('contacts_field_zip')
    case 'pinStaleness':
      return i18n.t('contacts_field_pinStaleness')
    case 'followUp':
      return i18n.t('contacts_field_followUp')
    case 'isFavorite':
      return i18n.t('contacts_field_isFavorite')
    case 'hasStudy':
      return i18n.t('contacts_field_hasStudy')
    case 'isActiveStudy':
      return i18n.t('contacts_field_isActiveStudy')
  }
}

const operatorLabel = (op: TextOperator | ComparableOperator): string => {
  switch (op) {
    case 'equals':
      return i18n.t('contacts_op_equals')
    case 'contains':
      return i18n.t('contacts_op_contains')
    case 'startsWith':
      return i18n.t('contacts_op_startsWith')
    case 'isSet':
      return i18n.t('contacts_op_isSet')
    case 'notSet':
      return i18n.t('contacts_op_notSet')
    case 'gt':
      return i18n.t('contacts_op_gt')
    case 'lt':
      return i18n.t('contacts_op_lt')
  }
}

const operatorsForField = (
  key: FieldKey,
  customFieldDefs: CustomFieldDefinition[]
): (TextOperator | ComparableOperator)[] => {
  if (key === null) return []
  if (isBooleanField(key) || key === 'pinStaleness' || key === 'followUp')
    return []
  if (isTextField(key)) return TEXT_OPERATORS
  if (isCustomFieldKey(key)) {
    const def = customFieldDefs.find((d) => d.id === customFieldIdFromKey(key))
    if (def?.type === 'number' || def?.type === 'date') {
      return COMPARABLE_OPERATORS
    }
    return TEXT_OPERATORS
  }
  return []
}

const ContactsFilterSheet: React.FC<ContactsFilterSheetProps> = ({
  open,
  onOpenChange,
  initial,
  initialIndex,
  customFieldDefs,
  onSave,
}) => {
  const theme = useTheme()

  const [field, setField] = useState<FieldKey>(null)
  const [op, setOp] = useState<TextOperator | ComparableOperator | null>(null)
  const [value, setValue] = useState<string>('')
  const valueInput = useRef<TextInput>(null)

  const prevOpenRef = useRef(false)
  useEffect(() => {
    const wasClosed = !prevOpenRef.current
    prevOpenRef.current = open
    if (!open || !wasClosed) return
    if (initial) {
      setField(fieldKeyFromFilter(initial))
      switch (initial.kind) {
        case 'name':
        case 'phone':
        case 'email':
        case 'city':
        case 'state':
        case 'zip':
          setOp(initial.op)
          setValue(initial.value)
          break
        case 'customField':
          setOp(initial.op)
          setValue(initial.value)
          break
        case 'pinStaleness':
          setOp(null)
          setValue(initial.value)
          break
        case 'hasFollowUp':
        case 'noFollowUp':
        case 'followUpOverdue':
          setOp(null)
          setValue(initial.kind)
          break
        case 'isFavorite':
        case 'hasStudy':
        case 'isActiveStudy':
          setOp(null)
          setValue('')
          break
      }
    } else {
      setField(null)
      setOp(null)
      setValue('')
    }
  }, [open, initial])

  useEffect(() => {
    if (field === null) {
      if (op !== null) setOp(null)
      return
    }
    const valid = operatorsForField(field, customFieldDefs)
    if (valid.length === 0) {
      if (op !== null) setOp(null)
      return
    }
    if (op === null || !valid.includes(op)) {
      setOp(valid[0])
    }
  }, [field, customFieldDefs, op])

  useEffect(() => {
    if (field === null) {
      if (value !== '') setValue('')
      return
    }
    if (isBooleanField(field)) {
      if (value !== '') setValue('')
    }
  }, [field, value])

  useEffect(() => {
    if (field === 'followUp')
      setValue((v) => (isFollowUpFilterKind(v) ? v : ''))
    else setValue((v) => (isFollowUpFilterKind(v) ? '' : v))
  }, [field])

  const availableFields: Exclude<FieldKey, null>[] = [
    ...TEXT_FIELD_KEYS,
    'pinStaleness',
    'followUp',
    ...BOOLEAN_FIELD_KEYS,
    ...customFieldDefs
      .filter(
        (d) =>
          !d.archived ||
          (initial?.kind === 'customField' && initial.defId === d.id)
      )
      .sort((a, b) => a.order - b.order)
      .map((d) => `customField:${d.id}` as CustomFieldKey),
  ]

  const validOperators = useMemo(
    () => operatorsForField(field, customFieldDefs),
    [field, customFieldDefs]
  )

  const customDef = useMemo(() => {
    if (!isCustomFieldKey(field)) return undefined
    return customFieldDefs.find((d) => d.id === customFieldIdFromKey(field))
  }, [field, customFieldDefs])

  const isChoiceField = field === 'pinStaleness' || field === 'followUp'

  const showOperatorRow =
    field !== null && !isBooleanField(field) && !isChoiceField

  const showValueRow =
    field !== null &&
    !isBooleanField(field) &&
    !isChoiceField &&
    op !== 'isSet' &&
    op !== 'notSet'

  const isValid = useMemo(() => {
    if (field === null) return false
    if (isBooleanField(field)) return true
    if (field === 'pinStaleness') {
      return PIN_STALENESS_VALUES.includes(value as ContactStaleness)
    }
    if (field === 'followUp') return isFollowUpFilterKind(value)
    if (op === null) return false
    if (op === 'isSet' || op === 'notSet') return true
    return value.trim().length > 0
  }, [field, op, value])

  const validation = useFormValidation(
    {
      field: field === null,
      operator: showOperatorRow && op === null,
      value: field !== null && !isValid && (!showOperatorRow || op !== null),
    },
    'contact_filter',
    open
  )

  const buildFilter = (): ActiveFilter | null => {
    if (field === null) return null
    if (field === 'isFavorite') return { kind: 'isFavorite' }
    if (field === 'hasStudy') return { kind: 'hasStudy' }
    if (field === 'isActiveStudy') return { kind: 'isActiveStudy' }
    if (field === 'pinStaleness') {
      if (!PIN_STALENESS_VALUES.includes(value as ContactStaleness)) return null
      return { kind: 'pinStaleness', value: value as ContactStaleness }
    }
    if (field === 'followUp') {
      return isFollowUpFilterKind(value) ? { kind: value } : null
    }
    if (op === null) return null
    if (isCustomFieldKey(field)) {
      const defId = customFieldIdFromKey(field)
      const cleaned = op === 'isSet' || op === 'notSet' ? '' : value
      return {
        kind: 'customField',
        defId,
        op: op as ComparableOperator,
        value: cleaned,
      }
    }
    if (isTextField(field)) {
      const cleaned = op === 'isSet' || op === 'notSet' ? '' : value
      return {
        kind: field,
        op: op as TextOperator,
        value: cleaned,
      }
    }
    return null
  }

  const handleApply = () => {
    if (!validation.validate()) return
    const built = buildFilter()
    if (!built) return
    onSave(built, initialIndex ?? null)
    onOpenChange(false)
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  const sectionTitleStyle = {
    fontSize: theme.fontSize('sm'),
    color: theme.colors.textAlt,
    fontFamily: theme.fonts.semiBold,
    textTransform: 'uppercase' as const,
    letterSpacing: tracking(0.5),
  }

  const fieldOptions: ChoiceChip<Exclude<FieldKey, null>>[] =
    availableFields.map((key) => ({
      key,
      label: fieldLabel(key, customFieldDefs),
    }))

  const operatorOptions: ChoiceChip<TextOperator | ComparableOperator>[] =
    validOperators.map((candidate) => ({
      key: candidate,
      label: operatorLabel(candidate),
    }))

  const pinStalenessOptions: ChoiceChip<ContactStaleness>[] =
    PIN_STALENESS_VALUES.map((candidate) => ({
      key: candidate,
      label: i18n.t(`contacts_pinStaleness_${candidate}` as const),
    }))

  const followUpOptions: ChoiceChip<FollowUpFilterKind>[] =
    FOLLOW_UP_FILTER_KINDS.map((candidate) => ({
      key: candidate,
      label: i18n.t(`contacts_followUpFilter_${candidate}` as const),
    }))

  const valueInputProps: {
    inputMode?: 'decimal'
    placeholder?: string
  } = {}
  if (isCustomFieldKey(field) && customDef?.type === 'number') {
    valueInputProps.inputMode = 'decimal'
  } else if (isCustomFieldKey(field) && customDef?.type === 'date') {
    valueInputProps.placeholder = 'YYYY-MM-DD'
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      backgroundColor={theme.colors.background}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('xl'),
            color: theme.colors.text,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('contacts_filters')}
        </Text>
        <IconButton
          frame
          onPress={handleCancel}
          size={20}
          icon={XIcon}
          color={theme.colors.text}
        />
      </View>

      <Sheet.ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 16,
        }}
      >
        <View style={{ gap: 22 }}>
          {}
          <View style={{ gap: 14 }}>
            <View
              style={{
                gap: 8,
                borderWidth: 1,
                borderColor: validation.invalid('field')
                  ? theme.colors.error
                  : 'transparent',
                borderRadius: theme.numbers.borderRadiusMd,
              }}
            >
              <Text style={sectionTitleStyle}>
                {i18n.t('contacts_filterField')}
              </Text>
              <ChoiceChips<Exclude<FieldKey, null>>
                value={field}
                onChange={setField}
                options={fieldOptions}
              />
            </View>

            {showOperatorRow && (
              <View
                style={{
                  gap: 8,
                  borderWidth: 1,
                  borderColor: validation.invalid('operator')
                    ? theme.colors.error
                    : 'transparent',
                  borderRadius: theme.numbers.borderRadiusMd,
                }}
              >
                <Text style={sectionTitleStyle}>
                  {i18n.t('contacts_filterOperator')}
                </Text>
                <ChoiceChips<TextOperator | ComparableOperator>
                  value={op}
                  onChange={setOp}
                  options={operatorOptions}
                />
              </View>
            )}

            {field === 'pinStaleness' && (
              <View
                style={{
                  gap: 8,
                  borderWidth: 1,
                  borderColor: validation.invalid('value')
                    ? theme.colors.error
                    : 'transparent',
                  borderRadius: theme.numbers.borderRadiusMd,
                }}
              >
                <Text style={sectionTitleStyle}>
                  {i18n.t('contacts_filterValue')}
                </Text>
                <ChoiceChips<ContactStaleness>
                  value={value as ContactStaleness}
                  onChange={(v) => setValue(v)}
                  options={pinStalenessOptions}
                />
              </View>
            )}

            {field === 'followUp' && (
              <View
                style={{
                  gap: 8,
                  borderWidth: 1,
                  borderColor: validation.invalid('value')
                    ? theme.colors.error
                    : 'transparent',
                  borderRadius: theme.numbers.borderRadiusMd,
                }}
              >
                <Text style={sectionTitleStyle}>
                  {i18n.t('contacts_filterValue')}
                </Text>
                <ChoiceChips<FollowUpFilterKind>
                  value={isFollowUpFilterKind(value) ? value : null}
                  onChange={(v) => setValue(v)}
                  options={followUpOptions}
                />
              </View>
            )}

            {showValueRow && (
              <View style={{ gap: 8 }}>
                <Pressable
                  onPress={() => valueInput.current?.focus()}
                  hitSlop={{ top: 8, bottom: 8 }}
                  accessibilityRole='button'
                  accessibilityLabel={i18n.t('contacts_filterValue')}
                >
                  <Text style={sectionTitleStyle}>
                    {i18n.t('contacts_filterValue')}
                  </Text>
                </Pressable>
                <MyTextInput
                  invalid={validation.invalid('value')}
                  ref={valueInput}
                  value={value}
                  onChangeText={setValue}
                  placeholder={valueInputProps.placeholder}
                  inputMode={valueInputProps.inputMode}
                  placeholderTextColor={
                    theme.colors.textAlt as InputProps['placeholderTextColor']
                  }
                  textAlign='start'
                />
              </View>
            )}
          </View>
        </View>
      </Sheet.ScrollView>

      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        <Button
          onPress={handleApply}
          noTransform
          style={{
            paddingVertical: 14,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.numbers.borderRadiusMd,
            backgroundColor: theme.colors.accent,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('contacts_filter_apply')}
          </Text>
        </Button>
      </View>
    </Sheet>
  )
}

export default ContactsFilterSheet
