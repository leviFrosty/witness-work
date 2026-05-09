import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
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
import SegmentedControl, { SegmentedOption } from '../SegmentedControl'

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
  const valueInput = useRef<TextInput>(null)

  // Seed local state every time the sheet flips open. We deliberately do NOT
  // sync on every prop tick — only on the open transition — so user input
  // isn't stomped if the parent re-renders mid-edit. The ref gates re-runs
  // triggered by `initial` reference churn while the sheet is already open.
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

  // Whenever `field` changes, clamp `op` to a value that's valid for that
  // field (or null when the field doesn't take an operator). Without this the
  // user could leave a `gt` op selected after switching from a custom number
  // field to a plain text field and then submit something invalid. The body
  // is idempotent — re-runs from `op` ticking are no-ops once `op` is valid.
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

  // Reset value when switching between field shapes that don't share value
  // semantics (e.g. text -> pinStaleness leaving "Phoenix" in the buffer).
  // Body is idempotent — user typing into a non-boolean field re-triggers
  // this effect but the guards bail without touching state.
  useEffect(() => {
    if (field === null) {
      if (value !== '') setValue('')
      return
    }
    if (isBooleanField(field)) {
      if (value !== '') setValue('')
    }
  }, [field, value])

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

  const fieldOptions: SegmentedOption<Exclude<FieldKey, null>>[] =
    availableFields.map((key) => ({
      key,
      label: fieldLabel(key, customFieldDefs),
    }))

  const operatorOptions: SegmentedOption<TextOperator | ComparableOperator>[] =
    validOperators.map((candidate) => ({
      key: candidate,
      label: operatorLabel(candidate),
    }))

  const pinStalenessOptions: SegmentedOption<ContactStaleness>[] =
    PIN_STALENESS_VALUES.map((candidate) => ({
      key: candidate,
      label: i18n.t(`contacts_pinStaleness_${candidate}` as const),
    }))

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

  if (!open) return null

  return (
    // Absolutely-positioned overlay rendered inside the parent screen rather
    // than a Tamagui Sheet. The parent (ContactsSortAndFilterScreen) is itself
    // an iOS native form-sheet modal, and a Tamagui Sheet's portal/RN-Modal
    // attaches to the React root which sits *behind* the form-sheet — opening
    // it from within would render the sheet but never make it visible. Staying
    // inline within the parent's view tree keeps everything visible.
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        backgroundColor: theme.colors.background,
      }}
    >
      <View style={{ flex: 1 }}>
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
            onPress={handleCancel}
            size={20}
            icon={faTimes}
            color={theme.colors.text}
          />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 120,
          }}
          keyboardShouldPersistTaps='handled'
        >
          <View style={{ gap: 22 }}>
            {/* Top sections (field/operator/value) share a 14px rhythm. */}
            <View style={{ gap: 14 }}>
              <View style={{ gap: 8 }}>
                <Text style={sectionTitleStyle}>
                  {i18n.t('contacts_filterField')}
                </Text>
                <SegmentedControl<Exclude<FieldKey, null>>
                  variant='bordered'
                  wrap
                  value={field}
                  onChange={setField}
                  options={fieldOptions}
                />
              </View>

              {showOperatorRow && (
                <View style={{ gap: 8 }}>
                  <Text style={sectionTitleStyle}>
                    {i18n.t('contacts_filterOperator')}
                  </Text>
                  <SegmentedControl<TextOperator | ComparableOperator>
                    variant='bordered'
                    wrap
                    value={op}
                    onChange={setOp}
                    options={operatorOptions}
                  />
                </View>
              )}

              {field === 'pinStaleness' && (
                <View style={{ gap: 8 }}>
                  <Text style={sectionTitleStyle}>
                    {i18n.t('contacts_filterValue')}
                  </Text>
                  <SegmentedControl<ContactStaleness>
                    variant='bordered'
                    wrap
                    value={value as ContactStaleness}
                    onChange={(v) => setValue(v)}
                    options={pinStalenessOptions}
                  />
                </View>
              )}

              {showValueRow && field !== 'pinStaleness' && (
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
                  <TextInput
                    ref={valueInput}
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
        </ScrollView>

        {/* Sticky bottom action row — sits over the ScrollView's bottom
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
      </View>
    </View>
  )
}

export default ContactsFilterSheet
