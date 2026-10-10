import {
  Search as SearchIcon,
  UserPlus as UserPlusIcon,
} from 'lucide-react-native'
import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { Input, type InputProps } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import type { ConversationIndex } from '@/lib/conversationIndex'
import ContactRow from '@/features/contacts/components/ContactRow'
import LogVisitNearbyHint from '@/features/log-visit/components/LogVisitNearbyHint'
import LogVisitSectionHeader from '@/features/log-visit/components/LogVisitSectionHeader'
import type { LogVisitListItem } from '@/features/log-visit/lib/logVisitList'

/**
 * The picker step: search (not focused, so the suggestions stay in view), the
 * Nearby hint, then the rows. Tapping a row picks that Contact; touching and
 * holding it still offers Open Contact.
 */
export default function LogVisitContactList({
  items,
  query,
  onQueryChange,
  showsNearbyHint,
  onTurnOnNearby,
  index,
  onPick,
  onAddNew,
}: {
  items: LogVisitListItem[]
  query: string
  onQueryChange: (query: string) => void
  showsNearbyHint: boolean
  onTurnOnNearby: () => void
  index: ConversationIndex
  onPick: (item: Extract<LogVisitListItem, { type: 'contact' }>) => void
  onAddNew: (name: string) => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlashListRef<LogVisitListItem>>(null)

  // Back to the top as the query changes, so the best matches are in view.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [query])

  return (
    <View style={{ flex: 1 }}>
      <View style={{ gap: 8, paddingHorizontal: 16, paddingTop: 12 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 44,
            paddingHorizontal: 12,
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
          <Input
            unstyled
            testID='log-visit-search'
            accessibilityLabel={i18n.t('logVisit_searchPlaceholder')}
            value={query}
            onChangeText={onQueryChange}
            placeholder={i18n.t('logVisit_searchPlaceholder')}
            placeholderTextColor={
              theme.colors.textAlt as InputProps['placeholderTextColor']
            }
            clearButtonMode='while-editing'
            enterKeyHint='search'
            autoCorrect={false}
            style={{
              flex: 1,
              color: theme.colors.text,
              fontFamily: theme.fonts.regular,
              fontSize: theme.fontSize('md'),
            }}
          />
        </View>
        {showsNearbyHint && <LogVisitNearbyHint onTurnOn={onTurnOnNearby} />}
      </View>
      <FlashList
        ref={listRef}
        data={items}
        // A search swaps the whole list; anchoring to an old row would leave it
        // blank until scrolled (see ContactsScreen).
        maintainVisibleContentPosition={{ disabled: true }}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        keyboardDismissMode='on-drag'
        keyboardShouldPersistTaps='handled'
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: insets.bottom + 24,
        }}
        renderItem={({ item }) => {
          switch (item.type) {
            case 'header':
              return (
                <LogVisitSectionHeader
                  title={item.title}
                  section={item.section}
                />
              )
            case 'contact':
              return (
                <View style={{ paddingVertical: 4 }}>
                  <ContactRow
                    contact={item.contact}
                    index={index}
                    detail={item.detail}
                    searchMatches={item.searchMatches}
                    showsDisclosure
                    showOpenInMenu
                    onPress={() => onPick(item)}
                  />
                </View>
              )
            case 'noMatches':
              return (
                <Text
                  style={{
                    paddingTop: 16,
                    paddingBottom: 8,
                    paddingHorizontal: 4,
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('logVisit_noMatches', { query: item.query })}
                </Text>
              )
            case 'addNew':
              return (
                <Button
                  testID='log-visit-add-new'
                  accessibilityRole='button'
                  onPress={() => onAddNew(item.name)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    marginTop: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderRadius: theme.numbers.borderRadiusSm,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: theme.colors.border,
                  }}
                >
                  <LucideIcon
                    icon={UserPlusIcon}
                    size={theme.fontSize('md')}
                    style={{ color: theme.colors.accent }}
                  />
                  <Text
                    numberOfLines={2}
                    style={{
                      flexShrink: 1,
                      color: theme.colors.accent,
                      fontFamily: theme.fonts.semiBold,
                    }}
                  >
                    {i18n.t('logVisit_addAsNewContact', { name: item.name })}
                  </Text>
                </Button>
              )
          }
        }}
      />
    </View>
  )
}
