import {
  ArrowDown as ArrowDownIcon,
  ArrowUp as ArrowUpIcon,
  BookUser as BookUserIcon,
  Plus as PlusIcon,
  Search as SearchIcon,
} from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import {
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import { TextInput, useWindowDimensions, View } from 'react-native'
import { Input, InputProps } from 'tamagui'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { FlashList, FlashListRef } from '@shopify/flash-list'
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
} from '@react-navigation/native'
import * as Crypto from 'expo-crypto'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import useContacts from '@/stores/contactsStore'
import {
  filterActivesContacts,
  isContactDismissed,
} from '@/lib/dismissedContacts'
import useContactsSearchStore from '@/features/contacts/stores/contactsSearchStore'
import { usePreferences } from '@/stores/preferences'
import i18n, { TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import RootHeader from '@/components/RootHeader'
import { ContactsView } from '@/types/homeStack'
import Collapse from '@/components/ui/Collapse'
import Empty from '@/components/ui/Empty'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'
import Text from '@/components/ui/MyText'
import ContactRow from '@/features/contacts/components/ContactRow'
import ContactsStalenessChips from '@/features/contacts/components/ContactsStalenessChips'
import ContactsViewToggle from '@/features/contacts/components/ContactsViewToggle'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import FoldSplit from '@/components/ui/layout/FoldSplit'
import { RootStackNavigation } from '@/types/rootStack'
import { useContactsSorted } from '@/features/contacts/hooks/useContactsSorted'
import { Contact } from '@/types/contact'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import ContactDetailsContent from '@/features/contacts/components/ContactDetailsContent'
import ContactsSelectionBar from '@/features/contacts/components/ContactsSelectionBar'
import PullDownMenu from '@/components/ui/PullDownMenu'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu.types'
import {
  SELECTION_BAR_HEIGHT,
  SelectionTextButton,
} from '@/features/contacts/components/ListSelection'
import useListSelection from '@/features/contacts/hooks/useListSelection'
import useHideBarsOnScroll from '@/hooks/useHideBarsOnScroll'
import useTabReselect from '@/hooks/useTabReselect'
import useHideTabBar from '@/hooks/useHideTabBar'
import useScreenReaderEnabled from '@/hooks/useScreenReaderEnabled'
import ScrollAwayHeader from '@/components/ui/ScrollAwayHeader'
import { contactSortLabel } from '@/features/contacts/lib/contactsQueryLabels'
import { sortRowDetail } from '@/features/contacts/lib/sortRowDetail'
import useSavedContactViews from '@/features/contacts/hooks/useSavedContactViews'
import SavedViewsBar from '@/features/contacts/components/SavedViewsBar'
import useSuggestedContactsList from '@/features/contacts/hooks/useSuggestedContactsList'
import {
  ContactsListSectionHeader,
  ContactsListSeparator,
} from '@/features/contacts/components/ContactsListSection'
import {
  contactItemIndex,
  ContactsListItem,
} from '@/features/contacts/lib/suggestedContactsList'
import { alignInput } from '@/lib/direction'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

const LIST_COLUMN_WIDTH = 390

const ContactsSearchInput = ({
  ref,
  placeholder,
}: {
  ref: RefObject<TextInput | null>
  placeholder: string
}) => {
  const theme = useTheme()
  const search = useContactsSearchStore((s) => s.search)
  const setSearch = useContactsSearchStore((s) => s.setSearch)
  return (
    <Input
      unstyled
      ref={ref}
      testID='contacts-search'
      value={search}
      onChangeText={setSearch}
      accessibilityLabel={placeholder}
      placeholder={placeholder}
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

        textAlign: alignInput('start'),
      }}
    />
  )
}

const ContactsScreen = ({
  renderMap,
  focusSearch,
  onSearchFocused,
}: {
  renderMap: (props: {
    topInset: number
    onExplore: () => void
    onExploreEnd: () => void
    contacts: Contact[]
  }) => ReactNode
  focusSearch?: boolean
  onSearchFocused?: () => void
}) => {
  const theme = useTheme()
  const { isWide, hasBottomBar } = useAdaptiveLayout()
  const foldColumn = useFoldColumn(isWide ? null : 720)
  const [selectedId, setSelectedId] = useState<string>()
  const insets = useSafeAreaInsets()
  const { height: windowHeight, fontScale } = useWindowDimensions()
  const navigation = useNavigation<RootStackNavigation>()
  const contactsView = usePreferences((s) => s.contactsView)
  const hasCompletedMapOnboarding = usePreferences(
    (s) => s.hasCompletedMapOnboarding
  )
  const setPreferences = usePreferences((s) => s.set)
  const showsMap = contactsView === 'map'
  const [headerHeight, setHeaderHeight] = useState(0)
  const [mapExplored, setMapExplored] = useState(false)

  if (!showsMap && mapExplored) setMapExplored(false)

  const exploreMap = () => setMapExplored(true)
  const endMapExplore = () => setMapExplored(false)
  const screenReader = useScreenReaderEnabled()

  const mapBarHidden = showsMap && mapExplored && hasBottomBar && !screenReader
  useHideTabBar(mapBarHidden)

  useFocusEffect(
    useCallback(() => {
      if (showsMap) analytics.screen('Map', { previous_screen: 'Contacts' })
    }, [showsMap])
  )

  const changeView = (view: ContactsView) => {
    if (view === contactsView) return

    setPreferences({ contactsView: view })
  }

  const contacts = useContacts((s) => s.contacts)
  const customFieldDefs = useContacts((s) => s.customFieldDefs)
  const dismissedCount = contacts.filter(isContactDismissed).length
  const activeContacts = filterActivesContacts(contacts)
  const mappedContacts = activeContacts.filter((c) => c.coordinate != null)

  const searchInputRef = useRef<TextInput>(null)
  const isFocused = useIsFocused()

  if (!isFocused && mapExplored) setMapExplored(false)

  useEffect(() => {
    if (!focusSearch || !isFocused || showsMap) return
    const frame = requestAnimationFrame(() => {
      if (!searchInputRef.current) return
      searchInputRef.current.focus()
      onSearchFocused?.()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusSearch, isFocused, showsMap, onSearchFocused])
  const listRef = useRef<FlashListRef<ContactsListItem>>(null)
  const previousIsWide = useRef(isWide)
  const flashListDrawDistance = Math.ceil(windowHeight)

  const {
    contactsFilters,
    contactSort,
    contactSortDirection,
    hasActiveFilters,
    isSortNonDefault,
    searchSortedAndFilteredContacts,
    sortedAndFilteredContacts,
    searchMatchesById,
    conversationIndex,
    search,
    hasSearch,
  } = useContactsSorted()

  const contactsList = useSuggestedContactsList({
    contacts: searchSortedAndFilteredContacts,
    index: conversationIndex,
    enabled: contactSort === 'suggested' && !hasSearch,
    listVisible: !showsMap,
  })
  const listContacts = contactsList.contacts
  const savedViews = useSavedContactViews()
  const showsSavedViews = savedViews.views.length > 0

  const showsMapFilters =
    showsMap && hasCompletedMapOnboarding && mappedContacts.length > 0

  const selection = useListSelection(listContacts.map((contact) => contact.id))
  const selectedContacts = listContacts.filter((contact) =>
    selection.isSelected(contact.id)
  )
  const bottomChrome = insets.bottom + (hasBottomBar ? TAB_BAR_HEIGHT : 0)

  const bars = useHideBarsOnScroll({
    enabled: !showsMap && !selection.selecting,
  })

  const selectedContact =
    listContacts.find((contact) => contact.id === selectedId) ?? listContacts[0]

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [search, contactsFilters, contactSort, contactSortDirection])

  const pickedInPane = useRef(false)

  const paneScroll = useRef<{ id: string; y: number } | null>(null)

  const readingContactId = useEffectEvent(() => {
    const list = listRef.current
    if (!list) return undefined
    const offset = list.getAbsoluteLastScrollOffset()

    if (offset <= 1) return undefined
    const line = offset + list.getWindowSize().height * 0.2
    const { startIndex, endIndex } = list.computeVisibleIndices()
    for (let i = Math.max(0, startIndex); i <= endIndex; i++) {
      const item = contactsList.items[i]
      const layout = list.getLayout(i)
      if (item?.kind !== 'contact' || !layout) continue
      if (layout.y + layout.height > line) return item.contact.id
    }
    return undefined
  })
  const pickedContact = listContacts.find(
    (contact) => contact.id === selectedId
  )
  useEffect(() => {
    const changed = previousIsWide.current !== isWide
    const collapsed = changed && !isWide
    previousIsWide.current = isWide
    const picked = pickedInPane.current

    if (changed) pickedInPane.current = false

    if (changed && isWide && !showsMap && !selectedId) {
      const reading = readingContactId()
      if (reading) setSelectedId(reading)
    }
    if (!collapsed || !picked || !pickedContact || showsMap) return
    const index = contactItemIndex(contactsList.items, pickedContact.id)

    requestAnimationFrame(() => {
      if (index >= 0) listRef.current?.scrollToIndex({ index, animated: false })
      if (!isFocused) return
      const read = paneScroll.current
      navigation.navigate('Contact Details', {
        id: pickedContact.id,
        scrollY: read?.id === pickedContact.id ? read.y : undefined,
      })
    })
  }, [
    isWide,
    selectedId,
    pickedContact,
    contactsList.items,
    showsMap,
    isFocused,
    navigation,
  ])

  const expandHeader = () => {
    if (!mapExplored) return
    setMapExplored(false)
  }

  useTabReselect(() => {
    if (showsMap) expandHeader()
    else listRef.current?.scrollToOffset({ offset: 0, animated: true })
  })

  const headerCollapsed = mapExplored
  const headerSwipeDown = Gesture.Pan()
    .runOnJS(true)
    .enabled(headerCollapsed)
    .activeOffsetY(12)
    .failOffsetY(-12)
    .onEnd((e) => {
      if (e.translationY > 24 || e.velocityY > 400) {
        expandHeader()
      }
    })

  const sortLabel = contactSortLabel(contactSort, customFieldDefs)

  const renderEmpty = () => {
    if (!hasSearch && !hasActiveFilters) {
      return (
        <Empty
          icon={
            <LucideIcon
              icon={BookUserIcon}
              size={24}
              color={theme.colors.text}
            />
          }
          title={i18n.t('noContactsYet')}
          description={i18n.t('noContactsSaved')}
        />
      )
    }
    return (
      <Empty
        icon={
          <LucideIcon icon={SearchIcon} size={24} color={theme.colors.text} />
        }
        title={i18n.t('contacts_emptySearch_title')}
        description={i18n.t('contacts_emptySearch_body')}
      />
    )
  }

  const moreActions: ContextMenuEntries = [
    [
      {
        id: 'sort_and_filter',
        title: i18n.t('contacts_sortAndFilter_title'),
        systemImage: 'line.3.horizontal.decrease.circle',
        onPress: () => navigation.navigate('Contacts Sort And Filter'),
      },
      !showsMap &&
        listContacts.length > 0 && {
          id: 'select',
          title: i18n.t('selectContacts'),
          systemImage: 'checkmark.circle',
          onPress: () => selection.start(),
        },
    ],
    [
      savedViews.views.length > 0 && {
        id: 'saved_views',
        title: i18n.t('savedViews_menu_edit'),
        systemImage: 'pencil',
        onPress: () => navigation.navigate('Saved Contact Views'),
      },
      dismissedCount > 0 && {
        id: 'dismissed_contacts',
        title: i18n.t('dismissedContacts'),
        systemImage: 'clock',
        onPress: () => navigation.navigate('Dismissed Contacts'),
      },
    ],
  ]

  const headerActions = selection.selecting ? (
    <>
      <SelectionTextButton
        label={i18n.t(selection.allSelected ? 'deselectAll' : 'selectAll')}
        onPress={selection.toggleAll}
      />
      <SelectionTextButton
        label={i18n.t('done')}
        emphasized
        onPress={selection.finish}
      />
    </>
  ) : (
    <>
      {}
      <PullDownMenu
        accessibilityLabel={i18n.t('moreActions')}
        triggerColor={theme.colors.accent}
        triggerSize={22}
        actions={moreActions}
      />
      {}
      <PointerTooltip label={i18n.t('addContact')} effect='none'>
        <IconButton
          icon={PlusIcon}
          size='lg'
          accessibilityLabel={i18n.t('addContact')}
          frame
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
          onPress={() => {
            const id = Crypto.randomUUID()
            if (isWide && !showsMap) {
              setSelectedId(id)
              pickedInPane.current = true
            }
            navigation.navigate('Contact Form', {
              id,
              returnToContacts: isWide && !showsMap,
            })
          }}
        />
      </PointerTooltip>
    </>
  )

  const stacksViewToggle = fontScale > 1.3
  const viewToggle = (
    <ContactsViewToggle
      value={contactsView}
      onChange={changeView}
      disabled={selection.selecting}
      style={stacksViewToggle ? { alignSelf: 'stretch' } : undefined}
    />
  )

  const rowState = [selection.selected, isWide, selectedContact?.id] as const
  const listPane = (
    <View onTouchStart={contactsList.markInteracted} style={{ flex: 1 }}>
      {}
      <View style={{ paddingBottom: 12 }}>
        {}
        <View
          style={{
            flexDirection: stacksViewToggle ? 'column' : 'row',
            alignItems: 'stretch',
            gap: stacksViewToggle ? 10 : 8,
            paddingHorizontal: 12,
          }}
        >
          <View
            style={{
              flex: stacksViewToggle ? undefined : 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 12,
              minHeight: 44,

              height: fontScale > 1 ? undefined : 44,
              borderRadius: theme.numbers.borderRadiusMd,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.backgroundLighter,
            }}
          >
            <LucideIcon
              icon={SearchIcon}
              size={theme.fontSize('xs')}
              style={{ color: theme.colors.textAlt }}
            />
            <ContactsSearchInput
              ref={searchInputRef}
              placeholder={
                activeContacts.length > 0
                  ? i18n.t('contacts_searchPlaceholder' as TranslationKey, {
                      count: activeContacts.length,
                    })
                  : i18n.t('searchForContact')
              }
            />
          </View>
          {viewToggle}
        </View>

        {showsSavedViews && (
          <Collapse collapsed={bars.hidden}>
            <View style={{ paddingTop: 10 }}>
              <SavedViewsBar surface='list' />
            </View>
          </Collapse>
        )}

        <Collapse collapsed={bars.hidden}>
          <View style={{ paddingTop: 10 }}>
            <ContactsStalenessChips
              contacts={activeContacts}
              index={conversationIndex}
              surface='list'
            />
          </View>
        </Collapse>

        {}
        {isSortNonDefault && sortLabel.length > 0 && (
          <Collapse collapsed={bars.hidden}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingTop: 10,
                paddingHorizontal: 12,
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
          </Collapse>
        )}
      </View>

      <FlashList
        ref={listRef}
        data={contactsList.items}
        maintainVisibleContentPosition={{ disabled: true }}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.kind}
        extraData={rowState}
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return <ContactsListSectionHeader section={item.section} />
          }
          const { contact, section } = item
          return (
            <ContactRow
              contact={contact}
              index={conversationIndex}
              searchMatches={searchMatchesById.get(contact.id)}
              detail={
                item.detail ??
                sortRowDetail({
                  sort: contactSort,
                  sortLabel,
                  contact,
                  index: conversationIndex,
                })
              }
              selected={isWide && selectedContact?.id === contact.id}
              showsDisclosure={!isWide}
              selectionMode={selection.selecting}
              checked={selection.isSelected(contact.id)}
              offersNotNow={section === 'beenAWhile'}
              onSelect={() => selection.start(contact.id)}
              onPress={() => {
                if (selection.selecting) {
                  selection.toggle(contact.id)
                  return
                }
                if (section) {
                  analytics.capture('contacts_suggested_contact_opened', {
                    variant: section,
                    nearby_shown: contactsList.showsNearby,
                  })
                }
                setSelectedId(contact.id)
                paneScroll.current = null
                if (isWide) pickedInPane.current = true
                if (!isWide)
                  navigation.navigate('Contact Details', {
                    id: contact.id,
                  })
              }}
            />
          )
        }}
        ItemSeparatorComponent={ContactsListSeparator}
        ListEmptyComponent={renderEmpty()}
        ListFooterComponent={
          dismissedCount > 0 && !selection.selecting ? (
            <Button
              onPress={() => navigation.navigate('Dismissed Contacts')}
              hitSlop={8}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'center',
                gap: 4,
                marginTop: 20,
                paddingVertical: 8,
                paddingHorizontal: 12,
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('contacts_dismissed' as TranslationKey, {
                  count: dismissedCount,
                })}
              </Text>
              <LucideIcon
                icon={ChevronForwardIcon}
                size={theme.fontSize('sm')}
                style={{ color: theme.colors.textAlt }}
              />
            </Button>
          ) : null
        }
        keyboardShouldPersistTaps='handled'
        keyboardDismissMode='on-drag'
        drawDistance={flashListDrawDistance}
        {...bars.scrollProps}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingBottom:
            bottomChrome +
            16 +
            (selection.selecting ? SELECTION_BAR_HEIGHT + 12 : 0),
        }}
      />
      {selection.selecting && (
        <ContactsSelectionBar
          contacts={selectedContacts}
          selection={selection}
          bottom={bottomChrome + (hasBottomBar ? 8 : 12)}
        />
      )}
    </View>
  )

  const contactDetailPane = (
    <View
      style={{
        flex: 1,
        borderStartWidth: 1,
        borderStartColor: theme.colors.border,
        marginRight: 16,
        marginBottom: hasBottomBar ? TAB_BAR_HEIGHT : 0,
        overflow: 'hidden',
        borderRadius: theme.numbers.borderRadiusLg,
      }}
    >
      {selectedContact ? (
        <ContactDetailsContent
          key={selectedContact.id}
          id={selectedContact.id}
          navigation={navigation}
          embedded
          onScrollY={(y) => {
            paneScroll.current = { id: selectedContact.id, y }
          }}
        />
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
          }}
        >
          {renderEmpty()}
        </View>
      )}
    </View>
  )

  const header = (
    <GestureDetector gesture={headerSwipeDown}>
      <View
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        style={
          showsMap
            ? { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }
            : undefined
        }
      >
        <ScrollAwayHeader hidden={bars.hidden}>
          <RootHeader
            floating={showsMap}
            compact={headerCollapsed}
            onPressTitle={headerCollapsed ? () => expandHeader() : undefined}
            title={
              selection.selecting
                ? i18n.t('selectedCount', { count: selection.ids.length })
                : i18n.t('contacts_screen_title')
            }
            actions={headerActions}
            contentStyle={[{ maxWidth: isWide ? 1200 : 720 }, foldColumn]}
          >
            {showsMap && (
              <FoldSplit
                gap={0}
                leadingWidth={isWide ? LIST_COLUMN_WIDTH : undefined}
                leading={
                  <View
                    style={{
                      alignItems: 'flex-end',
                      paddingTop: 4,
                      paddingBottom: headerCollapsed ? 8 : 10,
                      paddingHorizontal: 12,
                    }}
                  >
                    {viewToggle}
                  </View>
                }
                trailing={isWide ? <View /> : undefined}
              />
            )}
            {showsMapFilters && (
              <Collapse collapsed={headerCollapsed}>
                <View style={{ gap: 10, paddingBottom: 10 }}>
                  {showsSavedViews && <SavedViewsBar surface='map' />}
                  <ContactsStalenessChips
                    contacts={mappedContacts}
                    index={conversationIndex}
                    surface='map'
                  />
                </View>
              </Collapse>
            )}
          </RootHeader>
        </ScrollAwayHeader>
      </View>
    </GestureDetector>
  )

  const split = isWide && !showsMap
  if (!showsMap)
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {}
        <FoldSplit
          style={{
            flex: 1,
            width: '100%',
            maxWidth: split ? 1200 : undefined,
            alignSelf: 'center',
          }}
          gap={0}
          leadingWidth={split ? LIST_COLUMN_WIDTH : undefined}
          leading={
            <View style={{ flex: 1 }}>
              {header}
              <View
                style={
                  split
                    ? { flex: 1, paddingTop: 4 }
                    : [
                        {
                          flex: 1,
                          paddingTop: 4,
                          width: '100%',
                          maxWidth: 720,
                          alignSelf: 'center',
                        },
                        foldColumn,
                      ]
                }
              >
                {listPane}
              </View>
            </View>
          }
          trailing={split ? contactDetailPane : undefined}
          trailingStyle={split ? { paddingTop: insets.top + 8 } : undefined}
        />
      </View>
    )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {header}
      <View style={{ flex: 1 }}>
        {renderMap({
          topInset: headerHeight,
          onExplore: exploreMap,
          onExploreEnd: endMapExplore,
          contacts: sortedAndFilteredContacts,
        })}
      </View>
    </View>
  )
}

export default ContactsScreen
