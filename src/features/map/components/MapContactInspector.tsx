import { View } from 'react-native'
import { FlashList, FlashListRef } from '@shopify/flash-list'
import { ReactElement, useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { PanelTrailingCloseIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerHover from '@/components/ui/PointerHover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import { FoldHandled } from '@/components/ui/layout/FoldPane'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { ConversationIndex } from '@/lib/conversationIndex'
import MapCarouselCard from '@/features/map/components/MapCarouselCard'
import { ContactMarker } from '@/features/map/types/map'
import useInspectorDetail from '@/features/map/hooks/useInspectorDetail'
import { MAP_CONTACT_DETAIL_TEST_ID } from '@/features/map/lib/mapTestIds'

export type MapContactRowRenderer = (props: {
  contact: ContactMarker
  index: ConversationIndex
  selected: boolean
  onPress: () => void
}) => ReactElement | null

export type MapContactDetailRenderer = (props: {
  contactId: string
  onClose: () => void
}) => ReactElement | null

interface Props {
  renderContactRow: MapContactRowRenderer
  renderContactDetail?: MapContactDetailRenderer
  contacts: ContactMarker[]
  activeId?: string
  revealRequest: number
  index: ConversationIndex
  onSelect: (id: string) => void

  onHoverContact?: (id: string, hovered: boolean) => void

  onHide?: () => void
}

export default function MapContactInspector({
  contacts,
  activeId,
  revealRequest,
  index,
  onSelect,
  onHoverContact,
  renderContactRow,
  renderContactDetail,
  onHide,
}: Props) {
  const theme = useTheme()
  const panelRef = useRef<View>(null)
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
  const detail = useInspectorDetail({
    contactIds: contacts.map((contact) => contact.id),
    activeId,
    panelRef,
  })
  const detailId = renderContactDetail ? detail.detailId : null

  useEffect(() => {
    if (
      !listLoaded ||
      !listHeight ||
      activeIndex < 0 ||
      lastRevealedRequest.current === revealRequest
    )
      return
    let cancelled = false

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
        logger.warn('[Map] Could not reveal contact row', error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeIndex, listHeight, listLoaded, revealRequest])

  const detailOpen = detailId !== null
  const listInert = { inert: detailOpen } as object

  return (
    <View
      ref={panelRef}
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
        style={{ flex: 1 }}
        accessibilityElementsHidden={detailOpen}
        importantForAccessibility={detailOpen ? 'no-hide-descendants' : 'auto'}
        {...listInert}
      >
        <View
          style={{
            padding: 16,
            paddingEnd: onHide ? 8 : 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Text
            style={{
              flex: 1,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('lg'),
            }}
          >
            {i18n.t('contacts_screen_title')}
          </Text>
          <Text style={{ color: theme.colors.textAlt }}>{contacts.length}</Text>
          {onHide && (
            <PointerTooltip label={i18n.t('map_hideContactList')}>
              <Button
                accessibilityLabel={i18n.t('map_hideContactList')}
                onPress={onHide}
                style={{
                  width: 44,
                  height: 44,
                  marginVertical: -12,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 0,
                  paddingVertical: 0,
                }}
              >
                <LucideIcon
                  icon={PanelTrailingCloseIcon}
                  size={theme.fontSize('md')}
                  style={{ color: theme.colors.textAlt }}
                />
              </Button>
            </PointerTooltip>
          )}
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
          renderItem={({ item }) => (
            <PointerHover
              onHoverChange={
                onHoverContact &&
                ((hovered) => onHoverContact(item.id, hovered))
              }
            >
              {}
              <View collapsable={false}>
                {renderContactRow({
                  contact: item,
                  index,
                  selected: item.id === activeContact?.id,
                  onPress: () => onSelect(item.id),
                })}
              </View>
            </PointerHover>
          )}
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
              onOpen={
                renderContactDetail
                  ? () => detail.open(activeContact.id)
                  : undefined
              }
            />
          </View>
        )}
      </View>
      {detailId && renderContactDetail && (
        <View
          testID={MAP_CONTACT_DETAIL_TEST_ID}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme.colors.background,
          }}
        >
          <FoldHandled>
            {renderContactDetail({
              contactId: detailId,
              onClose: detail.close,
            })}
          </FoldHandled>
        </View>
      )}
    </View>
  )
}
