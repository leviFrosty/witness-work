import React from 'react'
import { View } from 'react-native'
import { Sheet, XStack } from 'tamagui'
import {
  faArrowDown,
  faArrowUp,
  faCheck,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import useTheme from '../../contexts/theme'
import i18n from '../../lib/locales'
import Text from '../MyText'
import IconButton from '../IconButton'
import Button from '../Button'
import { builtInContactSortOptions } from '../../stores/preferences'
import type {
  ContactSortDirection,
  ContactSortKey,
} from '../../lib/contactsSort'
import type { CustomFieldDefinition } from '../../types/customField'

export type ContactsSortSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sort: ContactSortKey
  direction: ContactSortDirection
  customFieldDefs: CustomFieldDefinition[]
  onChangeSort: (sort: ContactSortKey) => void
  onChangeDirection: (direction: ContactSortDirection) => void
}

/**
 * Sort sheet for the Contacts tab. Replaces the previous `MenuView`-based
 * picker because we need a direction toggle that lives next to the dimension
 * picker — `MenuView` is single-select with no good place to host a segmented
 * control. Selection does not auto-dismiss; the user may want to change both
 * the dimension and direction in one trip and dismisses explicitly via the X,
 * swipe, or overlay tap.
 */
const ContactsSortSheet: React.FC<ContactsSortSheetProps> = ({
  open,
  onOpenChange,
  sort,
  direction,
  customFieldDefs,
  onChangeSort,
  onChangeDirection,
}) => {
  const theme = useTheme()

  const activeCustomFieldDefs = customFieldDefs
    .filter((def) => def.archived !== true)
    .slice()
    .sort((a, b) => a.order - b.order)

  const selectedRowStyle = {
    backgroundColor: theme.colors.accentTranslucent,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  }
  const unselectedRowStyle = {
    backgroundColor: theme.colors.backgroundLighter,
    borderWidth: 1,
    borderColor: theme.colors.border,
  }

  const renderRow = (
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void
  ) => (
    <Button
      key={key}
      onPress={onPress}
      style={{
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: theme.numbers.borderRadiusSm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...(selected ? selectedRowStyle : unselectedRowStyle),
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
    value: ContactSortDirection,
    label: string,
    icon: typeof faArrowUp
  ) => {
    const selected = direction === value
    return (
      <Button
        onPress={() => onChangeDirection(value)}
        style={{
          flex: 1,
          height: 44,
          borderRadius: theme.numbers.borderRadiusSm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          ...(selected ? selectedRowStyle : unselectedRowStyle),
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
            fontSize: theme.fontSize('md'),
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
            {i18n.t('contacts_sortBy')}
          </Text>
          <IconButton
            onPress={() => onOpenChange(false)}
            size={20}
            icon={faTimes}
            color={theme.colors.text}
          />
        </XStack>

        <Sheet.ScrollView
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 20 }}
        >
          <View style={{ gap: 8, paddingHorizontal: 20 }}>
            {builtInContactSortOptions.map((option) =>
              renderRow(
                option.value,
                option.label(),
                sort === option.value,
                () => onChangeSort(option.value)
              )
            )}

            {activeCustomFieldDefs.length > 0 && (
              <>
                <View style={{ marginTop: 16, marginBottom: 4 }}>
                  <Text
                    style={{
                      fontSize: theme.fontSize('sm'),
                      color: theme.colors.textAlt,
                      fontFamily: theme.fonts.semiBold,
                    }}
                  >
                    {i18n.t('contacts_pickCustomField')}
                  </Text>
                </View>
                {activeCustomFieldDefs.map((def) => {
                  const value: ContactSortKey = `customField:${def.id}`
                  return renderRow(value, def.label, sort === value, () =>
                    onChangeSort(value)
                  )
                })}
              </>
            )}
          </View>
        </Sheet.ScrollView>

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 34,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            gap: 8,
            backgroundColor: theme.colors.background,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('contacts_sortDirection')}
          </Text>
          <XStack gap={10}>
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
          </XStack>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default ContactsSortSheet
