import {
  ArrowDown as ArrowDownIcon,
  ArrowUp as ArrowUpIcon,
  BookUser as BookUserIcon,
  Plus as PlusIcon,
  Search as SearchIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { Input, InputProps } from 'tamagui'
import Animated from 'react-native-reanimated'
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
import { isContactDismissed } from '@/lib/dismissedContacts'
import useContactsSearchStore from '@/features/contacts/stores/contactsSearchStore'
import { builtInContactSortOptions, usePreferences } from '@/stores/preferences'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import RootHeader from '@/components/RootHeader'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { ContactsView } from '@/types/homeStack'
import Card from '@/components/ui/Card'
import Collapse from '@/components/ui/Collapse'
import Empty from '@/components/ui/Empty'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import ContactRow from '@/features/contacts/components/ContactRow'
import ContactsStatsHeader from '@/features/contacts/components/ContactsStatsHeader'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import { RootStackNavigation } from '@/types/rootStack'
import { useContactsSorted } from '@/features/contacts/hooks/useContactsSorted'
import { Contact } from '@/types/contact'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import ContactDetailsContent from '@/features/contacts/components/ContactDetailsContent'
import ContactsSelectionBar from '@/features/contacts/components/ContactsSelectionBar'
import PullDownMenu from '@/components/ui/PullDownMenu'
import {
  SELECTION_BAR_HEIGHT,
  SelectionTextButton,
} from '@/features/contacts/components/ListSelection'
import useListSelection from '@/features/contacts/hooks/useListSelection'
import { trackListScroll } from '@/features/contacts/lib/listHeaderCollapse'

/**
 * Tab-level Contacts screen with two workspaces, List and Map. The chosen one
 * is remembered, so people who come for the map return to it. Search lives
 * inline at the top of the list so it updates as the user types — search is the
 * dominant action there, and round-tripping through a sheet would hide the very
 * results being searched. Sort and filter are lower-frequency, so they're
 * tucked behind a single sliders icon that opens the modal
 * `ContactsSortAndFilterScreen`. Select mode (batch actions on the rows shown)
 * starts from the header's "…" menu, as in Notes and Files, or from a row's
 * long-press "Select". On the Map the header floats translucent over it so the
 * map runs edge to edge, and compacts once the user starts exploring. On the
 * List, scrolling down tucks everything but the title and search away;
 * scrolling up, swiping down on the header, or tapping the title restores it.
 */

const ContactsScreen = ({
  renderMap,
  focusSearch,
  onSearchFocused,
}: {
  /**
   * The Map workspace, composed in by the app tier. `topInset` is the height of
   * the header floating over it; `onExplore` compacts that header.
   */
  renderMap: (props: { topInset: number; onExplore: () => void }) => ReactNode
  focusSearch?: boolean
  onSearchFocused?: () => void
}) => {
  const theme = useTheme()
  const { isWide, hasSidebar } = useAdaptiveLayout()
  const [selectedId, setSelectedId] = useState<string>()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const navigation = useNavigation<RootStackNavigation>()
  const contactsView = usePreferences((s) => s.contactsView)
  const setPreferences = usePreferences((s) => s.set)
  const showsMap = contactsView === 'map'
  const [headerHeight, setHeaderHeight] = useState(0)
  const [mapExplored, setMapExplored] = useState(false)
  // Each visit to the Map starts with the full header.
  if (!showsMap && mapExplored) setMapExplored(false)
  const [listCollapsed, setListCollapsed] = useState(false)
  if (showsMap && listCollapsed) setListCollapsed(false)
  const hasCollapsedList = useRef(false)
  const listScroll = useRef({ userDriven: false, lastY: 0, anchorY: 0 })

  // Map was its own tab; keep reporting its reach as the `Map` screen (sent
  // once per session like every screen).
  useFocusEffect(
    useCallback(() => {
      if (showsMap) analytics.screen('Map', { previous_screen: 'Contacts' })
    }, [showsMap])
  )

  const changeView = (view: ContactsView) => {
    if (view === contactsView) return
    analytics.capture('contacts_view_changed', { view, source: 'toggle' })
    setPreferences({ contactsView: view })
  }

  const { contacts, customFieldDefs } = useContacts()
  const dismissedCount = contacts.filter(isContactDismissed).length

  const search = useContactsSearchStore((s) => s.search)
  const setSearch = useContactsSearchStore((s) => s.setSearch)
  const searchInputRef = useRef<TextInput>(null)
  const isFocused = useIsFocused()

  useEffect(() => {
    if (!focusSearch || !isFocused || showsMap) return
    const frame = requestAnimationFrame(() => {
      if (!searchInputRef.current) return
      searchInputRef.current.focus()
      onSearchFocused?.()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusSearch, isFocused, showsMap, onSearchFocused])
  const listRef = useRef<FlashListRef<Contact>>(null)
  const previousIsWide = useRef(isWide)
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

  const selection = useListSelection(
    'contacts',
    searchSortedAndFilteredContacts.map((contact) => contact.id)
  )
  const selectedContacts = searchSortedAndFilteredContacts.filter((contact) =>
    selection.isSelected(contact.id)
  )
  const bottomChrome = insets.bottom + (hasSidebar ? 0 : TAB_BAR_HEIGHT)

  const selectedContact =
    searchSortedAndFilteredContacts.find(
      (contact) => contact.id === selectedId
    ) ?? searchSortedAndFilteredContacts[0]

  // Keep the list pinned to the top as the query, filters, or sort change —
  // otherwise FlashList preserves the prior contentOffset and the visible
  // window slides past the most relevant matches as the result set
  // shrinks/grows or reorders under the user.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [search, contactsFilters, contactSort, contactSortDirection])

  // Keep the selected contact in view when a detail pane collapses into a list.
  useEffect(() => {
    const collapsed = previousIsWide.current && !isWide
    previousIsWide.current = isWide
    if (!collapsed || !selectedContact) return
    const index = searchSortedAndFilteredContacts.findIndex(
      (contact) => contact.id === selectedContact.id
    )
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: false })
    })
    return () => cancelAnimationFrame(frame)
  }, [isWide, selectedContact, searchSortedAndFilteredContacts])

  const collapseList = (collapsed: boolean) => {
    if (collapsed === listCollapsed) return
    // Reported once per visit; scrolling toggles it too often to count each.
    if (collapsed && !hasCollapsedList.current) {
      hasCollapsedList.current = true
      analytics.capture('contacts_list_header_collapsed')
    }
    setListCollapsed(collapsed)
  }

  const expandHeader = (source: 'title_tap' | 'header_swipe') => {
    if (!listCollapsed && !mapExplored) return
    analytics.capture('contacts_header_expanded', {
      view: contactsView,
      source,
    })
    setListCollapsed(false)
    setMapExplored(false)
  }

  // Only the user's own scrolling counts — the list also jumps to the top on
  // its own as the search changes.
  const handleListScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
    const frame = {
      y: contentOffset.y,
      contentHeight: contentSize.height,
      viewportHeight: layoutMeasurement.height,
    }
    if (!listScroll.current.userDriven) {
      listScroll.current.lastY = frame.y
      return
    }
    const collapsed = trackListScroll(listScroll.current, frame)
    if (collapsed !== undefined) collapseList(collapsed)
  }
  const setListScrollUserDriven = (userDriven: boolean) => () => {
    listScroll.current.userDriven = userDriven
  }
  const handleListDragStart = () => {
    listScroll.current.userDriven = true
    listScroll.current.anchorY = listScroll.current.lastY
  }

  const headerCollapsed = listCollapsed || mapExplored
  const headerSwipeDown = Gesture.Pan()
    .runOnJS(true)
    .enabled(headerCollapsed)
    .activeOffsetY(12)
    .failOffsetY(-12)
    .onEnd((e) => {
      if (e.translationY > 24 || e.velocityY > 400) {
        expandHeader('header_swipe')
      }
    })

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
      <PullDownMenu
        analyticsSurface='contacts_header'
        accessibilityLabel={i18n.t('moreActions')}
        triggerColor={theme.colors.accent}
        triggerSize={22}
        actions={[
          [
            !showsMap &&
              searchSortedAndFilteredContacts.length > 0 && {
                id: 'select',
                title: i18n.t('selectContacts'),
                systemImage: 'checkmark.circle',
                onPress: () => selection.start(),
              },
          ],
          [
            {
              id: 'sort_and_filter',
              title: i18n.t('sortAndFilterEllipsis'),
              systemImage: 'line.3.horizontal.decrease.circle',
              onPress: () => navigation.navigate('Contacts Sort And Filter'),
            },
            dismissedCount > 0 && {
              id: 'dismissed_contacts',
              title: i18n.t('dismissedContacts'),
              systemImage: 'clock',
              onPress: () => navigation.navigate('Dismissed Contacts'),
            },
          ],
        ]}
      />
      <IconButton
        icon={PlusIcon}
        size='lg'
        accessibilityLabel={i18n.t('addContact')}
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
          if (isWide && !showsMap) setSelectedId(id)
          navigation.navigate('Contact Form', {
            id,
            returnToContacts: isWide && !showsMap,
          })
        }}
      />
    </>
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <GestureDetector gesture={headerSwipeDown}>
        <View
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
          style={
            showsMap
              ? { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }
              : undefined
          }
        >
          <RootHeader
            floating={showsMap}
            compact={headerCollapsed}
            onPressTitle={
              headerCollapsed ? () => expandHeader('title_tap') : undefined
            }
            title={
              selection.selecting
                ? // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
                  i18n.t('selectedCount', { count: selection.ids.length })
                : i18n.t('contacts_screen_title')
            }
            actions={headerActions}
            contentStyle={{ maxWidth: isWide ? 1200 : 720 }}
          >
            {!selection.selecting && (
              <Collapse collapsed={listCollapsed}>
                <Animated.View
                  style={{
                    height: mapExplored ? 34 : 40,
                    transitionProperty: 'height',
                    transitionDuration: 260,
                    transitionTimingFunction: 'ease-in-out',
                  }}
                >
                  <SegmentedControl<ContactsView>
                    value={contactsView}
                    onChange={changeView}
                    style={{ height: '100%' }}
                    options={[
                      { key: 'list', label: i18n.t('contacts_view_list') },
                      { key: 'map', label: i18n.t('map') },
                    ]}
                  />
                </Animated.View>
              </Collapse>
            )}
          </RootHeader>
        </View>
      </GestureDetector>
      {showsMap ? (
        <View style={{ flex: 1 }}>
          {renderMap({
            topInset: headerHeight,
            onExplore: () => setMapExplored(true),
          })}
        </View>
      ) : (
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            paddingTop: 4,
            flexDirection: isWide ? 'row' : 'column',
            width: '100%',
            maxWidth: isWide ? 1200 : 720,
            alignSelf: 'center',
          }}
        >
          <View
            style={{
              flex: isWide ? undefined : 1,
              width: isWide ? 350 : undefined,
            }}
          >
            <View style={{ paddingHorizontal: 12, gap: 12, paddingBottom: 12 }}>
              <Card style={{ paddingVertical: 16, paddingHorizontal: 16 }}>
                <View>
                  <Collapse collapsed={listCollapsed}>
                    <View style={{ paddingBottom: 14 }}>
                      <ContactsStatsHeader
                        contacts={contacts}
                        index={conversationIndex}
                        onPressDismissed={() =>
                          navigation.navigate('Dismissed Contacts')
                        }
                      />
                    </View>
                  </Collapse>

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
                        minHeight: 44,
                        height: 44,
                        borderRadius: theme.numbers.borderRadiusMd,
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
                          theme.colors
                            .textAlt as InputProps['placeholderTextColor']
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
                      onPress={() =>
                        navigation.navigate('Contacts Sort And Filter')
                      }
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
                    <Collapse collapsed={listCollapsed}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingTop: 10,
                        }}
                      >
                        <LucideIcon
                          icon={
                            contactSortDirection === 'asc'
                              ? ArrowUpIcon
                              : ArrowDownIcon
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
              // A new Set on every selection change, start, and finish — no need
              // to join every selected id into a string on each render.
              extraData={selection.selected}
              renderItem={({ item }) => (
                <ContactRow
                  contact={item}
                  index={conversationIndex}
                  searchMatches={searchMatchesById.get(item.id)}
                  selected={isWide && selectedContact?.id === item.id}
                  showsDisclosure={!isWide}
                  selectionMode={selection.selecting}
                  checked={selection.isSelected(item.id)}
                  onSelect={() => selection.start(item.id, 'row')}
                  onPress={() => {
                    if (selection.selecting) {
                      selection.toggle(item.id)
                      return
                    }
                    setSelectedId(item.id)
                    if (!isWide)
                      navigation.navigate('Contact Details', { id: item.id })
                  }}
                />
              )}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              ListEmptyComponent={renderEmpty()}
              keyboardShouldPersistTaps='handled'
              keyboardDismissMode='on-drag'
              drawDistance={flashListDrawDistance}
              onScroll={handleListScroll}
              scrollEventThrottle={16}
              onScrollBeginDrag={handleListDragStart}
              onScrollEndDrag={setListScrollUserDriven(false)}
              onMomentumScrollBegin={setListScrollUserDriven(true)}
              onMomentumScrollEnd={setListScrollUserDriven(false)}
              // Tapping the status bar returns to the top on iOS.
              onScrollToTop={() => collapseList(false)}
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
                bottom={bottomChrome + (hasSidebar ? 12 : 8)}
              />
            )}
          </View>
          {isWide && (
            <View
              style={{
                flex: 1,
                borderLeftWidth: 1,
                borderLeftColor: theme.colors.border,
                marginRight: 16,
                marginBottom: hasSidebar ? 0 : TAB_BAR_HEIGHT,
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
          )}
        </View>
      )}
    </View>
  )
}

export default ContactsScreen
