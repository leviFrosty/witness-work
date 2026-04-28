import React, { useEffect, useMemo, useState } from 'react'
import { TextInput, View } from 'react-native'
import { Sheet, XStack } from 'tamagui'
import { faTimes } from '@fortawesome/free-solid-svg-icons'

import useTheme from '../../contexts/theme'
import i18n from '../../lib/locales'
import {
  ActiveFilter,
  AddressKind,
  ComparableOperator,
  IdentityKind,
  TextOperator,
} from '../../lib/contactsFilters'
import { ContactStaleness } from '../../lib/contactStaleness'
import { CustomFieldDefinition } from '../../types/customField'
import Button from '../Button'
import IconButton from '../IconButton'
import Text from '../MyText'

export type ContactsFilterSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When editing an existing chip, pass the current filter + its index. */
  initial?: ActiveFilter
  initialIndex?: number
  customFieldDefs: CustomFieldDefinition[]
  onSave: (filter: ActiveFilter, index: number | null) => void
}

type TextFieldKey = IdentityKind | AddressKind
type BooleanFieldKey = 'isFavorite' | 'hasStudy' | 'isActiveStudy'
type StaticFieldKey = TextFieldKey | BooleanFieldKey | 'pinStaleness'

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

/**
 * Returns the operator set valid for the currently selected field. The sheet
 * uses this both to render the operator buttons and to clamp `op` back into the
 * legal set whenever the field changes.
 */
const operatorsForField = (
  key: FieldKey,
  customFieldDefs: CustomFieldDefinition[]
): (TextOperator | ComparableOperator)[] => {
  if (key === null) return []
  if (isBooleanField(key) || key === 'pinStaleness') return []
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

  // Seed local state every time the sheet flips open. We deliberately do NOT
  // sync on every prop tick — only on the open transition — so user input
  // isn't stomped if the parent re-renders mid-edit.
  useEffect(() => {
    if (!open) return
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Whenever `field` changes, clamp `op` to a value that's valid for that
  // field (or null when the field doesn't take an operator). Without this the
  // user could leave a `gt` op selected after switching from a custom number
  // field to a plain text field and then submit something invalid.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, customFieldDefs])

  // Reset value when switching between field shapes that don't share value
  // semantics (e.g. text -> pinStaleness leaving "Phoenix" in the buffer).
  useEffect(() => {
    if (field === null) {
      if (value !== '') setValue('')
      return
    }
    if (isBooleanField(field)) {
      if (value !== '') setValue('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field])

  const availableFields = useMemo<Exclude<FieldKey, null>[]>(() => {
    const base: Exclude<FieldKey, null>[] = [
      ...TEXT_FIELD_KEYS,
      'pinStaleness',
      ...BOOLEAN_FIELD_KEYS,
    ]
    const customs = customFieldDefs
      .filter((d) => !d.archived)
      .sort((a, b) => a.order - b.order)
      .map((d) => `customField:${d.id}` as CustomFieldKey)
    return [...base, ...customs]
  }, [customFieldDefs])

  const validOperators = useMemo(
    () => operatorsForField(field, customFieldDefs),
    [field, customFieldDefs]
  )

  const customDef = useMemo(() => {
    if (!isCustomFieldKey(field)) return undefined
    return customFieldDefs.find((d) => d.id === customFieldIdFromKey(field))
  }, [field, customFieldDefs])

  const showOperatorRow =
    field !== null && !isBooleanField(field) && field !== 'pinStaleness'

  const showValueRow =
    field !== null &&
    !isBooleanField(field) &&
    op !== 'isSet' &&
    op !== 'notSet'

  const isValid = useMemo(() => {
    if (field === null) return false
    if (isBooleanField(field)) return true
    if (field === 'pinStaleness') {
      return PIN_STALENESS_VALUES.includes(value as ContactStaleness)
    }
    if (op === null) return false
    if (op === 'isSet' || op === 'notSet') return true
    return value.trim().length > 0
  }, [field, op, value])

  const buildFilter = (): ActiveFilter | null => {
    if (field === null) return null
    if (field === 'isFavorite') return { kind: 'isFavorite' }
    if (field === 'hasStudy') return { kind: 'hasStudy' }
    if (field === 'isActiveStudy') return { kind: 'isActiveStudy' }
    if (field === 'pinStaleness') {
      if (!PIN_STALENESS_VALUES.includes(value as ContactStaleness)) return null
      return { kind: 'pinStaleness', value: value as ContactStaleness }
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
    letterSpacing: 0.5,
  }

  const renderFieldButton = (key: Exclude<FieldKey, null>) => {
    const selected = field === key
    return (
      <Button
        key={`field-${key}`}
        onPress={() => setField(key)}
        noTransform
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: theme.numbers.borderRadiusSm,
          borderWidth: 1,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          backgroundColor: selected
            ? theme.colors.accentTranslucent
            : theme.colors.backgroundLighter,
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: selected ? theme.colors.accent : theme.colors.text,
            fontFamily: selected ? theme.fonts.semiBold : theme.fonts.regular,
          }}
        >
          {fieldLabel(key, customFieldDefs)}
        </Text>
      </Button>
    )
  }

  const renderOperatorButton = (
    candidate: TextOperator | ComparableOperator
  ) => {
    const selected = op === candidate
    return (
      <Button
        key={`op-${candidate}`}
        onPress={() => setOp(candidate)}
        noTransform
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: theme.numbers.borderRadiusSm,
          borderWidth: 1,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          backgroundColor: selected
            ? theme.colors.accentTranslucent
            : theme.colors.backgroundLighter,
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: selected ? theme.colors.accent : theme.colors.text,
            fontFamily: selected ? theme.fonts.semiBold : theme.fonts.regular,
          }}
        >
          {operatorLabel(candidate)}
        </Text>
      </Button>
    )
  }

  const renderPinStalenessButton = (candidate: ContactStaleness) => {
    const selected = value === candidate
    return (
      <Button
        key={`pin-${candidate}`}
        onPress={() => setValue(candidate)}
        noTransform
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: theme.numbers.borderRadiusSm,
          borderWidth: 1,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          backgroundColor: selected
            ? theme.colors.accentTranslucent
            : theme.colors.backgroundLighter,
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: selected ? theme.colors.accent : theme.colors.text,
            fontFamily: selected ? theme.fonts.semiBold : theme.fonts.regular,
          }}
        >
          {i18n.t(`contacts_pinStaleness_${candidate}` as const)}
        </Text>
      </Button>
    )
  }

  // Pick the proper TextInput config for the active field. Custom number/date
  // fields surface specialised keyboards / placeholders so the user knows what
  // shape of value the comparator expects.
  const valueInputProps: {
    keyboardType?: 'numeric' | 'default'
    placeholder?: string
  } = {}
  if (isCustomFieldKey(field) && customDef?.type === 'number') {
    valueInputProps.keyboardType = 'numeric'
  } else if (isCustomFieldKey(field) && customDef?.type === 'date') {
    valueInputProps.placeholder = 'YYYY-MM-DD'
  }

  return (
    <Sheet
      open={open}
      modal
      snapPoints={[80]}
      onOpenChange={onOpenChange}
      dismissOnSnapToBottom
      animation='quick'
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <XStack ai='center' jc='space-between' px={20} pt={20} pb={10}>
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
            onPress={handleCancel}
            size={20}
            icon={faTimes}
            color={theme.colors.text}
          />
        </XStack>

        <Sheet.ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 6,
            paddingBottom: 120,
          }}
        >
          <View style={{ gap: 22 }}>
            {/* Top sections (field/operator/value) share a 14px rhythm. */}
            <View style={{ gap: 14 }}>
              <View style={{ gap: 8 }}>
                <Text style={sectionTitleStyle}>
                  {i18n.t('contacts_filterField')}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  {availableFields.map(renderFieldButton)}
                </View>
              </View>

              {showOperatorRow && (
                <View style={{ gap: 8 }}>
                  <Text style={sectionTitleStyle}>
                    {i18n.t('contacts_filterOperator')}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    {validOperators.map(renderOperatorButton)}
                  </View>
                </View>
              )}

              {field === 'pinStaleness' && (
                <View style={{ gap: 8 }}>
                  <Text style={sectionTitleStyle}>
                    {i18n.t('contacts_filterValue')}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    {PIN_STALENESS_VALUES.map(renderPinStalenessButton)}
                  </View>
                </View>
              )}

              {showValueRow && field !== 'pinStaleness' && (
                <View style={{ gap: 8 }}>
                  <Text style={sectionTitleStyle}>
                    {i18n.t('contacts_filterValue')}
                  </Text>
                  <TextInput
                    value={value}
                    onChangeText={setValue}
                    placeholder={valueInputProps.placeholder}
                    keyboardType={valueInputProps.keyboardType ?? 'default'}
                    placeholderTextColor={theme.colors.textAlt}
                    style={{
                      backgroundColor: theme.colors.backgroundLighter,
                      borderColor: theme.colors.border,
                      borderWidth: 1,
                      borderRadius: theme.numbers.borderRadiusSm,
                      padding: 12,
                      color: theme.colors.text,
                      fontFamily: theme.fonts.regular,
                      fontSize: theme.fontSize('md'),
                    }}
                  />
                </View>
              )}
            </View>
          </View>
        </Sheet.ScrollView>

        {/* Sticky bottom action row — sits over Sheet.ScrollView's bottom
            padding so neither button is ever hidden behind the home indicator. */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 28,
            backgroundColor: theme.colors.background,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            flexDirection: 'row',
            gap: 10,
          }}
        >
          <Button
            onPress={handleCancel}
            noTransform
            style={{
              flex: 1,
              paddingVertical: 14,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.numbers.borderRadiusMd,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.backgroundLighter,
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                color: theme.colors.text,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('cancel')}
            </Text>
          </Button>
          <Button
            onPress={handleApply}
            disabled={!isValid}
            noTransform
            style={{
              flex: 2,
              paddingVertical: 14,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.numbers.borderRadiusMd,
              backgroundColor: isValid
                ? theme.colors.accent
                : theme.colors.accentAlt,
              opacity: isValid ? 1 : 0.6,
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
      </Sheet.Frame>
    </Sheet>
  )
}

export default ContactsFilterSheet
