import { View } from 'react-native'
import { FlashList, FlashListRef } from '@shopify/flash-list'
import { ReactElement, useEffect, useRef, useState } from 'react'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { ConversationIndex } from '@/lib/conversationIndex'
import MapCarouselCard from '@/features/map/components/MapCarouselCard'
import { MapShareSheet } from '@/features/map/components/ShareAddressSheet'
import { ContactMarker } from '@/features/map/types/map'

/**
 * App-tier composition supplies the shared Contacts row without a feature
 * dependency.
 */
export type MapContactRowRenderer = (props: {
  contact: ContactMarker
  index: ConversationIndex
  selected: boolean
  onPress: () => void
}) => ReactElement | null

interface Props {
  renderContactRow: MapContactRowRenderer
  contacts: ContactMarker[]
  activeId?: string
  revealRequest: number
  index: ConversationIndex
  onSelect: (id: string) => void
  setSheet: React.Dispatch<React.SetStateAction<MapShareSheet>>
}

/** Keep the map visible while browsing and acting on contacts. */
export default function MapContactInspector({
  contacts,
  activeId,
  revealRequest,
  index,
  onSelect,
  setSheet,
  renderContactRow,
}: Props) {
  const theme = useTheme()
  const listRef = useRef<FlashListRef<ContactMarker>>(null)
  const lastRevealedRequest = useRef(-1)
  const revealQueue = useRef<Promise<void>>(Promise.resolve())
  const [listLoaded, setListLoaded] = useState(false)
  const [listHeight, setListHeight] = useState(0)
  const activeContact =
    contacts.find((contact) => contact.id === activeId) ?? contacts[0]
  const activeIndex = contacts.findIndex(
    (contact) => contact.id === activeContact?.id
  )

  useEffect(() => {
    if (
      !listLoaded ||
      !listHeight ||
      activeIndex < 0 ||
      lastRevealedRequest.current === revealRequest
    )
      return
    let cancelled = false
    // FlashList measures variable-height rows while resolving distant targets.
    // Serialize reveals so a slower previous measurement cannot overwrite the
    // newest pin selection; queued superseded requests are skipped entirely.
    revealQueue.current = revealQueue.current.then(async () => {
      if (cancelled || !listRef.current) return
      try {
        await listRef.current.scrollToIndex({
          index: activeIndex,
          animated: false,
          viewPosition: 0.5,
        })
        if (!cancelled) lastRevealedRequest.current = revealRequest
      } catch (error) {
        // A data removal during measurement must not block later pin reveals.
        logger.warn('[Map] Could not reveal contact row', error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeIndex, listHeight, listLoaded, revealRequest])

  return (
    <View
      style={{
        flex: 1,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          padding: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('lg'),
          }}
        >
          {i18n.t('contacts_screen_title')}
        </Text>
        <Text style={{ color: theme.colors.textAlt }}>{contacts.length}</Text>
      </View>
      <FlashList
        ref={listRef}
        onLoad={() => setListLoaded(true)}
        onLayout={(event) => setListHeight(event.nativeEvent.layout.height)}
        maintainVisibleContentPosition={{ disabled: true }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        data={contacts}
        keyExtractor={(contact) => contact.id}
        extraData={activeContact?.id}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}
        renderItem={({ item }) =>
          renderContactRow({
            contact: item,
            index,
            selected: item.id === activeContact?.id,
            onPress: () => onSelect(item.id),
          })
        }
      />
      {activeContact && (
        <View
          style={{
            padding: 8,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
          <MapCarouselCard
            contact={activeContact}
            index={index}
            setSheet={setSheet}
            inspector
          />
        </View>
      )}
    </View>
  )
}
