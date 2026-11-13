import { CircleX as CircleXIcon, Plus as PlusIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import React, { useState } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'

import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import confirmDestructive from '@/lib/confirmDestructive'
import useContacts from '@/stores/contactsStore'
import { builtInContactSortOptions } from '@/stores/preferences'
import {
  ActiveFilter,
  ComparableOperator,
  TextOperator,
} from '@/lib/contactsFilters'
import { ContactSortKey } from '@/lib/contactsSort'
import { CustomFieldDefinition } from '@/types/customField'
import { useContactsSorted } from '@/features/contacts/hooks/useContactsSorted'
import useContactsQuery from '@/features/contacts/hooks/useContactsQuery'
import SavedViewSection from '@/features/contacts/components/SavedViewSection'
import SortDirectionButtons from '@/components/sortFilter/SortDirectionButtons'
import SortFilterOption from '@/components/sortFilter/SortFilterOption'
import SortFilterSection from '@/components/sortFilter/SortFilterSection'
import SortFilterSheet from '@/components/sortFilter/SortFilterSheet'
import Button from '@/components/ui/Button'
import ContextMenu from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import ContactsFilterSheet from '@/features/contacts/components/ContactsFilterSheet'
import { RootStackNavigation } from '@/types/rootStack'
import { analytics } from '@/lib/analytics'

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
        return i18n.t('contacts_filterSummaryOp', {
          field: label,
          op: operatorLabel(filter.op),
        })
      }
      return i18n.t('contacts_filterSummaryOpValue', {
        field: label,
        op: operatorLabel(filter.op),
        value: filter.value,
      })
    }
    case 'customField': {
      const def = customFieldDefs.find((d) => d.id === filter.defId)
      const prefix = i18n.t('contacts_field_customField')
      const labelName = def?.label ?? ''
      const head = labelName
        ? i18n.t('contacts_filterSummaryField', {
            field: prefix,
            value: labelName,
          })
        : prefix
      if (filter.op === 'isSet' || filter.op === 'notSet') {
        return i18n.t('contacts_filterSummaryOp', {
          field: head,
          op: operatorLabel(filter.op),
        })
      }
      return i18n.t('contacts_filterSummaryOpValue', {
        field: head,
        op: operatorLabel(filter.op),
        value: filter.value,
      })
    }
    case 'pinStaleness': {
      const valueKey = `contacts_pinStaleness_${filter.value}` as const
      return i18n.t('contacts_filterSummaryField', {
        field: i18n.t('contacts_field_pinStaleness'),
        value: i18n.t(valueKey),
      })
    }
    case 'isFavorite':
      return i18n.t('contacts_field_isFavorite')
    case 'hasStudy':
      return i18n.t('contacts_field_hasStudy')
    case 'isActiveStudy':
      return i18n.t('contacts_field_isActiveStudy')
    case 'hasFollowUp':
    case 'noFollowUp':
    case 'followUpOverdue':
      return i18n.t('contacts_filterSummaryField', {
        field: i18n.t('contacts_field_followUp'),
        value: i18n.t(`contacts_followUpFilter_${filter.kind}` as const),
      })
  }
}

const ContactsSortAndFilterScreen = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  const { customFieldDefs } = useContacts()
  const {
    query: {
      filters: contactsFilters,
      sort: contactSort,
      direction: contactSortDirection,
    },
    view,
    edited,
    setFilters: setContactsFilters,
    setSort: setContactSort,
    setDirection: setContactSortDirection,
    reset,
  } = useContactsQuery()

  const { searchSortedAndFilteredContacts } = useContactsSorted()
  const resultCount = searchSortedAndFilteredContacts.length

  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [filterEditingIndex, setFilterEditingIndex] = useState<number | null>(
    null
  )

  const activeCustomFieldDefs = customFieldDefs
    .filter((d) => d.archived !== true || contactSort === `customField:${d.id}`)
    .sort((a, b) => a.order - b.order)

  const handleClose = () => {
    if (navigation.canGoBack()) navigation.goBack()
  }

  const handleAddFilter = () => {
    setFilterEditingIndex(null)
    setFilterSheetOpen(true)
  }
  const handleEditFilter = (index: number) => {
    setFilterEditingIndex(index)
    setFilterSheetOpen(true)
  }
  const handleRemoveFilter = (index: number) => {
    setContactsFilters(contactsFilters.filter((_, i) => i !== index))
  }
  const handleClearAllFilters = () => {
    confirmDestructive({
      title: i18n.t('clearAllFilters_title'),
      description: i18n.t('clearAllFilters_description'),
      confirmLabel: i18n.t('contacts_filter_clear_all'),
      onConfirm: () => setContactsFilters([]),
    })
  }
  const handleSaveFilter = (filter: ActiveFilter, index: number | null) => {
    if (index === null) {
      setContactsFilters([...contactsFilters, filter])
      analytics.capture('contacts_filter_added', { variant: filter.kind })
    } else {
      setContactsFilters(
        contactsFilters.map((f, i) => (i === index ? filter : f))
      )
    }
  }

  const canReset = !view || edited

  return (
    <SortFilterSheet
      resultCount={resultCount}
      canReset={canReset}
      onReset={reset}
      onClose={handleClose}
      overlay={
        <ContactsFilterSheet
          open={filterSheetOpen}
          onOpenChange={setFilterSheetOpen}
          initial={
            filterEditingIndex !== null
              ? contactsFilters[filterEditingIndex]
              : undefined
          }
          initialIndex={filterEditingIndex ?? undefined}
          customFieldDefs={customFieldDefs}
          onSave={handleSaveFilter}
        />
      }
    >
      <SavedViewSection />

      <SortFilterSection
        title={i18n.t('contacts_sortAndFilter_filtersSection')}
        action={
          contactsFilters.length > 1 && (
            <Button onPress={handleClearAllFilters} noTransform hitSlop={10}>
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
          )
        }
      >
        {contactsFilters.length > 0 && (
          <View style={{ gap: 8 }}>
            {contactsFilters.map((filter, index) => {
              const label = describeFilter(filter, customFieldDefs)
              return (
                <View
                  key={`filter-row-${index}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: theme.colors.accentTranslucent,
                    borderColor: theme.colors.accent,
                    borderWidth: 1,
                    borderRadius: theme.numbers.borderRadiusSm,
                    overflow: 'hidden',
                  }}
                >
                  <ContextMenu
                    style={{ flex: 1 }}
                    onPress={() => handleEditFilter(index)}
                    accessibilityLabel={label}
                    actions={[
                      {
                        id: 'edit',
                        title: i18n.t('editFilterEllipsis'),
                        systemImage: 'pencil',
                        onPress: () => handleEditFilter(index),
                      },
                      {
                        id: 'remove',
                        title: i18n.t('removeFilter'),
                        systemImage: 'xmark.circle',
                        destructive: true,
                        onPress: () => handleRemoveFilter(index),
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: theme.fontSize('sm'),
                        color: theme.colors.accent,
                        fontFamily: theme.fonts.semiBold,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                      }}
                      numberOfLines={2}
                    >
                      {label}
                    </Text>
                  </ContextMenu>
                  <Button
                    onPress={() => handleRemoveFilter(index)}
                    accessibilityLabel={i18n.t('removeFilter')}
                    noTransform
                    style={{
                      minWidth: MIN_TOUCH_TARGET,
                      minHeight: MIN_TOUCH_TARGET,
                      paddingHorizontal: 14,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <LucideIcon
                      icon={CircleXIcon}
                      size={theme.fontSize('md')}
                      style={{ color: theme.colors.accent }}
                    />
                  </Button>
                </View>
              )
            })}
          </View>
        )}

        <Button
          onPress={handleAddFilter}
          noTransform
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 12,
            borderRadius: theme.numbers.borderRadiusSm,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.colors.textAlt,
          }}
        >
          <LucideIcon
            icon={PlusIcon}
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
      </SortFilterSection>

      <SortFilterSection title={i18n.t('contacts_sortAndFilter_sortSection')}>
        <SortDirectionButtons
          value={contactSortDirection}
          onChange={setContactSortDirection}
        />

        <View style={{ gap: 8 }}>
          {builtInContactSortOptions.map((option) => (
            <SortFilterOption
              key={option.value}
              label={option.label()}
              selected={contactSort === option.value}
              onPress={() => setContactSort(option.value)}
              description={
                option.value === 'suggested'
                  ? i18n.t('contacts_sortBySuggested_description')
                  : undefined
              }
            />
          ))}

          {activeCustomFieldDefs.length > 0 && (
            <>
              <View style={{ marginTop: 8, marginBottom: 2 }}>
                <Text
                  style={{
                    fontSize: theme.fontSize('xs'),
                    color: theme.colors.textAlt,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('contacts_pickCustomField')}
                </Text>
              </View>
              {activeCustomFieldDefs.map((def) => {
                const value: ContactSortKey = `customField:${def.id}`
                return (
                  <SortFilterOption
                    key={value}
                    label={def.label}
                    selected={contactSort === value}
                    onPress={() => setContactSort(value)}
                  />
                )
              })}
            </>
          )}
        </View>
      </SortFilterSection>
    </SortFilterSheet>
  )
}

export default ContactsSortAndFilterScreen
