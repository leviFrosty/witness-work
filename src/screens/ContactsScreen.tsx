import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useNavigation } from '@react-navigation/native'
import * as Crypto from 'expo-crypto'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { faPlus, faSort } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import useContacts from '../stores/contactsStore'
import useConversations from '../stores/conversationStore'
import { usePreferences } from '../stores/preferences'
import i18n from '../lib/locales'
import GlassCard from '../components/GlassCard'
import SearchBar from '../components/SearchBar'
import IconButton from '../components/IconButton'
import Text from '../components/MyText'
import ContactRow from '../components/ContactRow'
import ContactsStatsHeader from '../components/contacts/ContactsStatsHeader'
import ContactsFilterBar from '../components/contacts/ContactsFilterBar'
import ContactsFilterSheet from '../components/contacts/ContactsFilterSheet'
import ContactsSortSheet from '../components/contacts/ContactsSortSheet'
import { TAB_BAR_HEIGHT } from '../components/TabBar'
import { RootStackNavigation } from '../types/rootStack'
import { applyFilters } from '../lib/contactsFilters'
import { buildContactComparator } from '../lib/contactsSort'
import { buildContactsFuse, searchContactsFuzzy } from '../lib/contactsSearch'
import { filterActivesContacts } from '../lib/dismissedContacts'

/**
 * Tab-level Contacts screen. Composes the per-domain components (stats header,
 * search bar, filter bar, sort sheet) on top of a single FlashList. The header
 * is sticky above the list; the list owns its own scroll. The "+" pill is the
 * only floating action — the global TabBar already supplies the QuickAction
 * accessory, so a second FAB would be redundant.
 */
const ContactsScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()

  const { contacts, customFieldDefs } = useContacts()
  const { conversations } = useConversations()
  const {
    contactSort,
    contactSortDirection,
    contactsFilters,
    setContactSort,
    setContactSortDirection,
    setContactsFilters,
  } = usePreferences()

  const [search, setSearch] = useState('')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [filterEditingIndex, setFilterEditingIndex] = useState<number | null>(
    null
  )
  const [sortSheetOpen, setSortSheetOpen] = useState(false)

  // 1. Drop dismissed contacts up front so neither search nor filter need to
  //    care about archive state — the dismissed pile lives on its own screen.
  const actives = useMemo(() => filterActivesContacts(contacts), [contacts])

  // 2. Build a Fuse index per [actives, conversations]. Rebuilds on every
  //    contact/conversation mutation but NOT on every keystroke.
  const fuse = useMemo(
    () => buildContactsFuse(actives, conversations),
    [actives, conversations]
  )

  // 3. Empty/whitespace search short-circuits to actives.
  const searched = useMemo(
    () => searchContactsFuzzy(search, fuse, actives),
    [search, fuse, actives]
  )

  // 4. AND-stack the user's chip filters on top of the (possibly searched) set.
  const filtered = useMemo(
    () =>
      applyFilters(searched, contactsFilters, {
        conversations,
        customFieldDefs,
      }),
    [searched, contactsFilters, conversations, customFieldDefs]
  )

  // 5. Comparator depends on dimension + direction + ctx; built once per
  //    change so the sort step below stays cheap.
  const comparator = useMemo(
    () =>
      buildContactComparator(contactSort, contactSortDirection, {
        conversations,
        customFieldDefs,
      }),
    [contactSort, contactSortDirection, conversations, customFieldDefs]
  )

  // 6. Sort lives outside the comparator memo so it re-runs whenever filtered
  //    changes too (e.g. after a search keystroke).
  const sortedContacts = useMemo(
    () => [...filtered].sort(comparator),
    [filtered, comparator]
  )

  const hasActiveFilters = contactsFilters.length > 0
  const hasSearch = search.trim().length > 0

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

  const renderEmpty = () => {
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
        <GlassCard variant='elevated' padding={16}>
          <View style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
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
            </View>

            <ContactsStatsHeader
              contacts={contacts}
              conversations={conversations}
              onPressDismissed={() => navigation.navigate('Dismissed Contacts')}
            />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'stretch',
                gap: 10,
                height: 50,
              }}
            >
              <SearchBar value={search} setValue={setSearch} />
              <IconButton
                icon={faPlus}
                size='lg'
                style={{
                  backgroundColor: theme.colors.accentTranslucent,
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 17,
                  borderRadius: theme.numbers.borderRadiusSm,
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

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <View style={{ flex: 1 }}>
                <ContactsFilterBar
                  filters={contactsFilters}
                  customFieldDefs={customFieldDefs}
                  onAdd={handleAddFilter}
                  onEdit={handleEditFilter}
                  onRemove={handleRemoveFilter}
                  onClearAll={handleClearAllFilters}
                />
              </View>
              <IconButton
                icon={faSort}
                size='lg'
                style={{
                  backgroundColor: theme.colors.backgroundLighter,
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 14,
                  borderRadius: theme.numbers.borderRadiusSm,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
                color={theme.colors.text}
                onPress={() => setSortSheetOpen(true)}
              />
            </View>
          </View>
        </GlassCard>
      </View>

      <FlashList
        data={sortedContacts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ContactRow
            contact={item}
            onPress={() =>
              navigation.navigate('Contact Details', { id: item.id })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={renderEmpty()}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 16,
        }}
      />

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

      <ContactsSortSheet
        open={sortSheetOpen}
        onOpenChange={setSortSheetOpen}
        sort={contactSort}
        direction={contactSortDirection}
        customFieldDefs={customFieldDefs}
        onChangeSort={setContactSort}
        onChangeDirection={setContactSortDirection}
      />
    </View>
  )
}

export default ContactsScreen
