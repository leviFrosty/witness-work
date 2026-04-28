import React from 'react'
import { ScrollView, View } from 'react-native'
import { faPlus, faTimes } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'

import useTheme from '../../contexts/theme'
import i18n from '../../lib/locales'
import {
  ActiveFilter,
  ComparableOperator,
  TextOperator,
} from '../../lib/contactsFilters'
import { CustomFieldDefinition } from '../../types/customField'
import Button from '../Button'
import Text from '../MyText'

export type ContactsFilterBarProps = {
  filters: ActiveFilter[]
  customFieldDefs: CustomFieldDefinition[]
  onAdd: () => void
  onEdit: (index: number) => void
  onRemove: (index: number) => void
  onClearAll: () => void
}

const CHIP_HEIGHT = 38

/**
 * Maps a TextOperator/ComparableOperator to its short i18n word. The chip label
 * glues this between the field label and the user-supplied value.
 */
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
 * Produce the human-readable summary shown on a filter chip. Resolved at render
 * time so that custom-field renames immediately reflect in the bar without
 * needing the persisted filter to mutate.
 */
const describeFilter = (
  filter: ActiveFilter,
  customFieldDefs: CustomFieldDefinition[]
): string => {
  switch (filter.kind) {
    case 'name':
    case 'phone':
    case 'email':
    case 'city':
    case 'state':
    case 'zip': {
      const fieldKey = `contacts_field_${filter.kind}` as const
      const label = i18n.t(fieldKey)
      if (filter.op === 'isSet' || filter.op === 'notSet') {
        return `${label} ${operatorLabel(filter.op)}`
      }
      return `${label} ${operatorLabel(filter.op)} "${filter.value}"`
    }
    case 'customField': {
      const def = customFieldDefs.find((d) => d.id === filter.defId)
      const prefix = i18n.t('contacts_field_customField')
      const labelName = def?.label ?? ''
      const head = labelName ? `${prefix}: ${labelName}` : prefix
      if (filter.op === 'isSet' || filter.op === 'notSet') {
        return `${head} ${operatorLabel(filter.op)}`
      }
      return `${head} ${operatorLabel(filter.op)} "${filter.value}"`
    }
    case 'pinStaleness': {
      const valueKey = `contacts_pinStaleness_${filter.value}` as const
      return `${i18n.t('contacts_field_pinStaleness')}: ${i18n.t(valueKey)}`
    }
    case 'isFavorite':
      return i18n.t('contacts_field_isFavorite')
    case 'hasStudy':
      return i18n.t('contacts_field_hasStudy')
    case 'isActiveStudy':
      return i18n.t('contacts_field_isActiveStudy')
  }
}

const ContactsFilterBar: React.FC<ContactsFilterBarProps> = ({
  filters,
  customFieldDefs,
  onAdd,
  onEdit,
  onRemove,
  onClearAll,
}) => {
  const theme = useTheme()

  return (
    <View
      style={{
        backgroundColor: theme.colors.backgroundLighter,
        borderRadius: theme.numbers.borderRadiusLg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: 8,
        paddingHorizontal: 8,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 4,
        }}
      >
        {filters.map((filter, index) => {
          const label = describeFilter(filter, customFieldDefs)
          return (
            <View
              key={`filter-chip-${index}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                height: CHIP_HEIGHT,
                borderRadius: CHIP_HEIGHT / 2,
                borderCurve: 'continuous',
                borderWidth: 1,
                borderColor: theme.colors.accent,
                backgroundColor: theme.colors.accentTranslucent,
                overflow: 'hidden',
              }}
            >
              <Button
                onPress={() => onEdit(index)}
                noTransform
                style={{
                  paddingLeft: 14,
                  paddingRight: 8,
                  height: '100%',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.accent,
                    fontFamily: theme.fonts.semiBold,
                  }}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Button>
              <Button
                onPress={() => onRemove(index)}
                noTransform
                hitSlop={6}
                style={{
                  paddingLeft: 4,
                  paddingRight: 12,
                  height: '100%',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <FontAwesomeIcon
                  icon={faTimes}
                  size={theme.fontSize('sm')}
                  style={{ color: theme.colors.accent }}
                />
              </Button>
            </View>
          )
        })}

        {filters.length > 1 && (
          <Button
            onPress={onClearAll}
            noTransform
            style={{
              height: CHIP_HEIGHT,
              paddingHorizontal: 8,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
                fontFamily: theme.fonts.semiBold,
                textDecorationLine: 'underline',
              }}
            >
              {i18n.t('contacts_filter_clear_all')}
            </Text>
          </Button>
        )}

        <Button
          onPress={onAdd}
          noTransform
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            height: CHIP_HEIGHT,
            paddingHorizontal: 14,
            borderRadius: CHIP_HEIGHT / 2,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.colors.textAlt,
          }}
        >
          <FontAwesomeIcon
            icon={faPlus}
            size={theme.fontSize('xs')}
            style={{ color: theme.colors.textAlt }}
          />
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('contacts_addFilter')}
          </Text>
        </Button>
      </ScrollView>
    </View>
  )
}

export default ContactsFilterBar
