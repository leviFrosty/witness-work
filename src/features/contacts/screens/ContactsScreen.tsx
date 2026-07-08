import {
  ArrowDown as ArrowDownIcon,
  ArrowUp as ArrowUpIcon,
  Plus as PlusIcon,
  Search as SearchIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useEffect, useMemo, useRef } from 'react'
import { TextInput, useWindowDimensions, View } from 'react-native'
import { Input, InputProps } from 'tamagui'
import { FlashList, FlashListRef } from '@shopify/flash-list'
import { useNavigation } from '@react-navigation/native'
import * as Crypto from 'expo-crypto'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import useContacts from '@/stores/contactsStore'
import useContactsSearchStore from '@/features/contacts/stores/contactsSearchStore'
import { builtInContactSortOptions } from '@/stores/preferences'
import i18n from '@/lib/locales'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import ContactRow from '@/features/contacts/components/ContactRow'
import ContactsStatsHeader from '@/features/contacts/components/ContactsStatsHeader'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import { RootStackNavigation } from '@/types/rootStack'
import { useContactsSorted } from '@/features/contacts/hooks/useContactsSorted'
import { Contact } from '@/types/contact'

/**
 * Tab-level Contacts screen. Search lives inline at the top so the list updates
 * as the user types — search is the dominant action on this screen, and
 * round-tripping through a sheet would hide the very results being searched.
 * Sort and filter are lower-frequency, so they're tucked behind a single
 * sliders icon that opens the modal `ContactsSortAndFilterScreen`. The "+" pill
 * is the only floating action; the global TabBar already supplies a QuickAction
 * accessory.
 */
const ContactsScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const navigation = useNavigation<RootStackNavigation>()

  const { contacts, customFieldDefs } = useContacts()

  const search = useContactsSearchStore((s) => s.search)
  const setSearch = useContactsSearchStore((s) => s.setSearch)
  const searchInputRef = useRef<TextInput>(null)
  const listRef = useRef<FlashListRef<Contact>>(null)
  const flashListDrawDistance = Math.ceil(windowHeight)

  const {
    contactsFilters,
    contactSort,
    contactSortDirection,
    hasActiveFilters,
    isSortNonDefault,
    searchSortedAndFilteredContacts,
    searchMatchesById,
    conversationIndex,
  } = useContactsSorted()

  // Keep the list pinned to the top as the query, filters, or sort change —
  // otherwise FlashList preserves the prior contentOffset and the visible
  // window slides past the most relevant matches as the result set
  // shrinks/grows or reorders under the user.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [search, contactsFilters, contactSort, contactSortDirection])

  const sortLabel = useMemo(() => {
    const builtIn = builtInContactSortOptions.find(
      (o) => o.value === contactSort
    )
    if (builtIn) return builtIn.label()
    if (
      typeof contactSort === 'string' &&
      contactSort.startsWith('customField:')
    ) {
      const defId = contactSort.slice('customField:'.length)
      const def = customFieldDefs.find((d) => d.id === defId)
      return def?.label ?? ''
    }
    return ''
  }, [contactSort, customFieldDefs])

  const renderEmpty = () => {
    const hasSearch = search.trim().length > 0
    if (!hasSearch && !hasActiveFilters) {
      return (
        <View style={{ paddingHorizontal: 12, paddingTop: 24 }}>
          <Text
            style={{
              textAlign: 'center',
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('md'),
            }}
          >
            {i18n.t('noContactsSaved')}
          </Text>
        </View>
      )
    }
    return (
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 32,
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('lg'),
            color: theme.colors.text,
            textAlign: 'center',
          }}
        >
          {i18n.t('contacts_emptySearch_title')}
        </Text>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('md'),
            textAlign: 'center',
          }}
        >
          {i18n.t('contacts_emptySearch_body')}
        </Text>
      </View>
    )
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top + 8,
      }}
    >
      <View style={{ paddingHorizontal: 12, gap: 12, paddingBottom: 12 }}>
        <Card style={{ paddingVertical: 16, paddingHorizontal: 16 }}>
          <View style={{ gap: 14 }}>
            {/* Title row: large title on the left, primary "+" CTA on the
                right. iOS-native: the page-level add action lives at the top
                of the screen, not floating beside the search input. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('2xl'),
                }}
              >
                {i18n.t('contacts_screen_title')}
              </Text>
              <IconButton
                icon={PlusIcon}
                size='lg'
                style={{
                  backgroundColor: theme.colors.accentTranslucent,
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: theme.colors.accent,
                }}
                color={theme.colors.accent}
                onPress={() =>
                  navigation.navigate('Contact Form', {
                    id: Crypto.randomUUID(),
                  })
                }
              />
            </View>

            <ContactsStatsHeader
              contacts={contacts}
              index={conversationIndex}
              onPressDismissed={() => navigation.navigate('Dismissed Contacts')}
            />

            {/* Search row. Inline TextInput so results update live as the user
                types. Trailing sliders button opens the Sort & Filter sheet —
                a small badge shows the active filter count when set. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 12,
                  height: 38,
                  borderRadius: theme.numbers.borderRadiusSm,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.background,
                }}
              >
                <LucideIcon
                  icon={SearchIcon}
                  size={theme.fontSize('xs')}
                  style={{ color: theme.colors.textAlt }}
                />
                <Input
                  unstyled
                  ref={searchInputRef}
                  value={search}
                  onChangeText={setSearch}
                  placeholder={i18n.t('searchForContact')}
                  placeholderTextColor={
                    theme.colors.textAlt as InputProps['placeholderTextColor']
                  }
                  clearButtonMode='while-editing'
                  enterKeyHint='search'
                  style={{
                    flex: 1,
                    color: theme.colors.text,
                    fontFamily: theme.fonts.regular,
                    fontSize: theme.fontSize('md'),
                  }}
                />
              </View>
              <Button
                onPress={() => navigation.navigate('Contacts Sort And Filter')}
                noTransform
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: theme.numbers.borderRadiusSm,
                  borderWidth: 1,
                  borderColor: hasActiveFilters
                    ? theme.colors.accent
                    : theme.colors.border,
                  backgroundColor: hasActiveFilters
                    ? theme.colors.accentTranslucent
                    : theme.colors.backgroundLighter,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LucideIcon
                  icon={SlidersHorizontalIcon}
                  size={theme.fontSize('sm')}
                  style={{
                    color: hasActiveFilters
                      ? theme.colors.accent
                      : theme.colors.textAlt,
                  }}
                />
                {hasActiveFilters && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      minWidth: 16,
                      height: 16,
                      paddingHorizontal: 4,
                      borderRadius: 8,
                      backgroundColor: theme.colors.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.textInverse,
                        fontFamily: theme.fonts.semiBold,
                        fontSize: theme.fontSize('xs'),
                      }}
                    >
                      {contactsFilters.length}
                    </Text>
                  </View>
                )}
              </Button>
            </View>

            {/* Subtle sort indicator. Only shows when the user has changed
                away from the default — keeps the resting state quiet. */}
            {isSortNonDefault && sortLabel.length > 0 && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: -4,
                }}
              >
                <LucideIcon
                  icon={
                    contactSortDirection === 'asc' ? ArrowUpIcon : ArrowDownIcon
                  }
                  size={theme.fontSize('xs')}
                  style={{ color: theme.colors.textAlt }}
                />
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('xs'),
                    fontFamily: theme.fonts.semiBold,
                  }}
                  numberOfLines={1}
                >
                  {i18n.t('contacts_sortAndFilter_sortLabel', {
                    label: sortLabel,
                  })}
                </Text>
              </View>
            )}
          </View>
        </Card>
      </View>

      <FlashList
        ref={listRef}
        data={searchSortedAndFilteredContacts}
        // FlashList v2 enables maintainVisibleContentPosition by default — it's
        // meant for chat UIs and anchors the viewport to a content item when the
        // data changes. On a search/filter list that's wrong: clearing the query
        // makes the data jump from a small filtered set back to the full list,
        // and MVCP anchors to the old item instead of re-laying-out, leaving the
        // list blank until a manual scroll forces a recompute. We always want to
        // pin to the top on data change (see the scrollToOffset effect above),
        // so disable it here.
        maintainVisibleContentPosition={{ disabled: true }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ContactRow
            contact={item}
            index={conversationIndex}
            searchMatches={searchMatchesById.get(item.id)}
            onPress={() =>
              navigation.navigate('Contact Details', { id: item.id })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={renderEmpty()}
        keyboardShouldPersistTaps='handled'
        keyboardDismissMode='on-drag'
        drawDistance={flashListDrawDistance}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 16,
        }}
      />
    </View>
  )
}

export default ContactsScreen
