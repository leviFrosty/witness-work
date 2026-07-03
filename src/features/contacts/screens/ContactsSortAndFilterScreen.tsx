import React, { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus'
import { faTimes } from '@fortawesome/free-solid-svg-icons/faTimes'
import { faTimesCircle } from '@fortawesome/free-solid-svg-icons/faTimesCircle'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'

import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import { builtInContactSortOptions, usePreferences } from '@/stores/preferences'
import {
  ActiveFilter,
  ComparableOperator,
  TextOperator,
} from '@/lib/contactsFilters'
import { ContactSortKey } from '@/lib/contactsSort'
import { CustomFieldDefinition } from '@/types/customField'
import { useContactsSorted } from '@/features/contacts/hooks/useContactsSorted'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import ContactsFilterSheet from '@/features/contacts/components/ContactsFilterSheet'
import { RootStackNavigation } from '@/types/rootStack'

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

/**
 * Modal screen that owns Contacts filter and sort controls. Search lives in the
 * parent `ContactsScreen` header so users can see results update as they type —
 * a sheet round-trip would hide the list. Filters/sort are lower-frequency, so
 * tucking them behind a single icon button keeps the tab UI quiet without
 * burying the affordance.
 *
 * Filters/sort are persisted via `usePreferences`, so dismissing the screen
 * leaves all selections intact for the underlying Contacts list.
 */
const ContactsSortAndFilterScreen = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  const { customFieldDefs } = useContacts()
  const {
    contactSort,
    contactSortDirection,
    contactsFilters,
    setContactSort,
    setContactSortDirection,
    setContactsFilters,
  } = usePreferences()

  const { searchSortedAndFilteredContacts } = useContactsSorted()
  const resultCount = searchSortedAndFilteredContacts.length

  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [filterEditingIndex, setFilterEditingIndex] = useState<number | null>(
    null
  )

  const activeCustomFieldDefs = useMemo(
    () =>
      customFieldDefs
        .filter((d) => d.archived !== true)
        .slice()
        .sort((a, b) => a.order - b.order),
    [customFieldDefs]
  )

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
    setContactsFilters([])
  }
  const handleSaveFilter = (
    filter: Parameters<typeof setContactsFilters>[0][number],
    index: number | null
  ) => {
    if (index === null) {
      setContactsFilters([...contactsFilters, filter])
    } else {
      setContactsFilters(
        contactsFilters.map((f, i) => (i === index ? filter : f))
      )
    }
  }
  const handleReset = () => {
    setContactsFilters([])
    setContactSort('suggested')
    setContactSortDirection('desc')
  }

  const sectionTitleStyle = {
    fontSize: theme.fontSize('xs'),
    color: theme.colors.textAlt,
    fontFamily: theme.fonts.semiBold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  }

  const renderSortRow = (
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void
  ) => (
    <Button
      key={key}
      onPress={onPress}
      noTransform
      style={{
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: theme.numbers.borderRadiusSm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: selected
          ? theme.colors.accentTranslucent
          : theme.colors.backgroundLighter,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('md'),
          fontFamily: selected ? theme.fonts.semiBold : theme.fonts.regular,
          color: selected ? theme.colors.accent : theme.colors.text,
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
      {selected && (
        <FontAwesomeIcon
          icon={faCheck}
          size={theme.fontSize('md')}
          style={{ color: theme.colors.accent }}
        />
      )}
    </Button>
  )

  const renderDirectionButton = (
    value: 'asc' | 'desc',
    label: string,
    icon: typeof faArrowUp
  ) => {
    const selected = contactSortDirection === value
    return (
      <Button
        onPress={() => setContactSortDirection(value)}
        noTransform
        style={{
          flex: 1,
          height: 40,
          borderRadius: theme.numbers.borderRadiusSm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: selected
            ? theme.colors.accentTranslucent
            : theme.colors.backgroundLighter,
          borderWidth: 1,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
        }}
      >
        <FontAwesomeIcon
          icon={icon}
          size={theme.fontSize('sm')}
          style={{
            color: selected ? theme.colors.accent : theme.colors.text,
          }}
        />
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: selected ? theme.fonts.semiBold : theme.fonts.regular,
            color: selected ? theme.colors.accent : theme.colors.text,
          }}
        >
          {label}
        </Text>
      </Button>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header — flows naturally at the top of the sheet. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('xl'),
            color: theme.colors.text,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('contacts_sortAndFilter_title')}
        </Text>
        <IconButton
          onPress={handleClose}
          size={20}
          icon={faTimes}
          color={theme.colors.text}
        />
      </View>

      {/* ScrollView fills the remaining space. Bottom padding leaves room for
          the absolute footer so the last sort row + direction toggles aren't
          ever obscured by it — same pattern as ContactsFilterSheet. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 18,
          paddingBottom: 120,
        }}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator
      >
        <View style={{ gap: 22 }}>
          {/* Filters section. */}
          <View style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={sectionTitleStyle}>
                {i18n.t('contacts_sortAndFilter_filtersSection')}
              </Text>
              {contactsFilters.length > 1 && (
                <Button
                  onPress={handleClearAllFilters}
                  noTransform
                  hitSlop={10}
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
            </View>

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
                      <Button
                        onPress={() => handleEditFilter(index)}
                        noTransform
                        style={{
                          flex: 1,
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: theme.fontSize('sm'),
                            color: theme.colors.accent,
                            fontFamily: theme.fonts.semiBold,
                          }}
                          numberOfLines={2}
                        >
                          {label}
                        </Text>
                      </Button>
                      <Button
                        onPress={() => handleRemoveFilter(index)}
                        noTransform
                        hitSlop={8}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <FontAwesomeIcon
                          icon={faTimesCircle}
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
          </View>

          {/* Sort section. With native form-sheet presentation the outer
              ScrollView happily handles all sort rows inline — no need for
              an inner scroll container, which is what previously fought
              the Tamagui sheet's drag handler. */}
          <View style={{ gap: 10 }}>
            <Text style={sectionTitleStyle}>
              {i18n.t('contacts_sortAndFilter_sortSection')}
            </Text>

            <View style={{ gap: 8 }}>
              {builtInContactSortOptions.map((option) =>
                renderSortRow(
                  option.value,
                  option.label(),
                  contactSort === option.value,
                  () => setContactSort(option.value)
                )
              )}

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
                    return renderSortRow(
                      value,
                      def.label,
                      contactSort === value,
                      () => setContactSort(value)
                    )
                  })}
                </>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              {renderDirectionButton(
                'asc',
                i18n.t('contacts_sortAscending'),
                faArrowUp
              )}
              {renderDirectionButton(
                'desc',
                i18n.t('contacts_sortDescending'),
                faArrowDown
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky footer: result count on the left, Reset + Done on the right.
          Reset clears filters/sort back to defaults; Done dismisses the sheet
          because every change above is already live in store state.

          Absolutely positioned (matching ContactsFilterSheet's pattern) so the
          ScrollView above can claim the full sheet height — when this footer
          was a flex sibling, the form-sheet presentation didn't always
          distribute remaining space to the ScrollView and the first scroll
          row could collide with the header above. */}
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
          alignItems: 'center',
          gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.semiBold,
            }}
            numberOfLines={1}
          >
            {
              // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
              i18n.t('contacts_sortAndFilter_resultCount', {
                count: resultCount,
              })
            }
          </Text>
        </View>
        <Button
          onPress={handleReset}
          noTransform
          style={{
            paddingVertical: 12,
            paddingHorizontal: 16,
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
            {i18n.t('reset')}
          </Text>
        </Button>
        <Button
          onPress={handleClose}
          noTransform
          style={{
            paddingVertical: 12,
            paddingHorizontal: 22,
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
            {i18n.t('done')}
          </Text>
        </Button>
      </View>

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
    </View>
  )
}

export default ContactsSortAndFilterScreen
