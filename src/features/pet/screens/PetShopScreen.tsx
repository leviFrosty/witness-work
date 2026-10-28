import { useEffect, useRef, useState } from 'react'
import { Platform, ScrollView, useWindowDimensions, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Text from '@/components/ui/MyText'
import FoldSplit from '@/components/ui/layout/FoldSplit'
import { useHorizontalBleed } from '@/components/ui/layout/HorizontalSafeArea'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import usePet from '@/stores/pet'
import type { RootStackParamList } from '@/types/rootStack'
import { resolveRoom, VIEW_CARD } from '@/features/pet/art'
import { cssColor, shopPalette } from '@/features/pet/art/shop'
import ShopBuyPanel from '@/features/pet/components/ShopBuyPanel'
import ShopHeader from '@/features/pet/components/ShopHeader'
import ShopItemCard from '@/features/pet/components/ShopItemCard'
import {
  ShopFrame,
  ShopPaper,
  shopPixelScale,
} from '@/features/pet/components/ShopPixels'
import ShopTabs from '@/features/pet/components/ShopTabs'
import usePetDark from '@/features/pet/hooks/usePetDark'
import usePetRoomScene from '@/features/pet/hooks/usePetRoomScene'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'
import {
  roomOptionLabel,
  roomSectionLabel,
} from '@/features/pet/lib/roomLabels'
import {
  roomChoicePatch,
  roomTabSections,
  roomWithChoice,
  selectedRoomOption,
} from '@/features/pet/lib/roomOptions'
import { noteRoomItemPicked, roomItemPicked } from '@/features/pet/lib/secrets'
import { shortBy, SHOP_TABS, type ShopTab } from '@/features/pet/lib/shop'
import { petShopOpensAsSheet } from '@/features/pet/lib/shopPresentation'
import {
  isNewRoomItem,
  shopEntries,
  shopPreviewView,
  type ShopEntry,
} from '@/features/pet/lib/shopEntries'
import { unlockedPart, unlockTab } from '@/features/pet/lib/unlockNews'
import PetSceneView from '@/features/pet/render/PetSceneView'
import type { PetRoomSettings, RoomItemId } from '@/types/pet'

type Props = NativeStackScreenProps<RootStackParamList, 'PetShop'>

/** From this wide, the room and the items sit side by side. */
const WIDE_FROM = 760
/** Side padding of the narrow layout. */
const INSET = 16
/** Between cards, besides the room each card keeps for its ring. */
const CARD_GAP = 4
/** About how wide a card is before another column fits. */
const CARD_MIN_WIDTH = 160

/** The room items and hat in `room`, as item ids. */
const roomItemsIn = (room: PetRoomSettings): string[] =>
  SHOP_TABS.flatMap((tab) =>
    roomTabSections(tab, room).map(
      ({ part }) => `${part}:${selectedRoomOption(room, part)}`
    )
  )

/** The category an item from Decorate Room (`focus`) belongs to. */
function tabOf(focus: string | undefined): ShopTab {
  if (!focus) return 'hat'
  const tab = unlockTab(unlockedPart(focus as RoomItemId).part)
  return (SHOP_TABS as readonly string[]).includes(tab)
    ? (tab as ShopTab)
    : 'hat'
}

/**
 * The Shop (ADR 0035): hats and room items bought with coins. The room on top
 * tries on whatever's picked; the categories and the items below it scroll. The
 * picked item's button buys it, wears it or puts it in the room. Side by side
 * from 760 points wide, meeting at iPhone Duo's fold.
 */
export default function PetShopScreen({ navigation, route }: Props) {
  const theme = useTheme()
  const palette = shopPalette(usePetDark())
  const scale = shopPixelScale()
  const insets = useSafeAreaInsets()
  const sheetInsets = usePetSheetInsets()
  const bleed = useHorizontalBleed()
  const window = useWindowDimensions()
  // As RootStack presented it, when it opened.
  const [sheet] = useState(petShopOpensAsSheet)
  const scene = usePetRoomScene()
  const focus = route.params?.focus
  const [tab, setTab] = useState<ShopTab>(() => tabOf(focus))
  const [pickedItem, setPickedItem] = useState<string | null>(focus ?? null)
  // Items picked while the Shop is open: no longer "New".
  const [tried, setTried] = useState<ReadonlySet<string>>(() => new Set())
  // The window's width until the screen is measured, so a wide window starts
  // in the wide layout.
  const [width, setWidth] = useState(window.width)
  const [gridWidth, setGridWidth] = useState(0)
  const [barHeight, setBarHeight] = useState(0)
  // The items' scroll view, back to the top for each category.
  const itemsScroll = useRef<ScrollView>(null)

  const from = route.params?.from ?? 'room'
  useEffect(() => {
    analytics.capture('pet_shop_opened', { from })
  }, [from])

  const paperColor = cssColor(palette.paper)
  useEffect(() => {
    navigation.setOptions({ contentStyle: { backgroundColor: paperColor } })
  }, [navigation, paperColor])

  // What's in the room was picked, even before picks were noted, so it never
  // says "New" once swapped out.
  const current = scene ? roomItemsIn(scene.state.room).join(' ') : ''
  useEffect(() => {
    for (const item of current.split(' ')) if (item) noteRoomItemPicked(item)
  }, [current])

  // Released on another device while open.
  const hasPet = scene !== null
  const focused = useIsFocused()
  useEffect(() => {
    if (!hasPet && focused) navigation.goBack()
  }, [hasPet, focused, navigation])
  if (!scene) return null

  const { state } = scene
  const room = state.room
  const sections = shopEntries(tab, room, state.unlockedItems, state.wallet)
  const entries = sections.flatMap((section) => section.entries)
  const picked =
    entries.find((entry) => entry.item === pickedItem) ??
    entries.find((entry) => entry.state === 'current') ??
    entries[0]
  const isNew = (entry: ShopEntry) =>
    isNewRoomItem(entry, (item) => tried.has(item) || roomItemPicked(item))

  const tryOn =
    picked && picked.state !== 'secret'
      ? roomWithChoice(room, picked.part, picked.option)
      : room
  const preview = {
    ...scene.input,
    room: resolveRoom(tryOn, scene.window),
  }

  const changeTab = (next: ShopTab) => {
    setTab(next)
    setPickedItem(null)
    itemsScroll.current?.scrollTo({ y: 0, animated: false })
  }
  const pick = (entry: ShopEntry) => {
    setPickedItem(entry.item)
    if (entry.state === 'owned' || entry.state === 'current') {
      noteRoomItemPicked(entry.item)
      setTried((last) => new Set(last).add(entry.item))
    }
  }
  const putOn = (entry: ShopEntry) => {
    usePet
      .getState()
      .updateRoom(
        roomChoicePatch(room, entry.part, entry.option),
        state.roomDefaults
      )
    noteRoomItemPicked(entry.item)
    analytics.capture('pet_room_changed', {
      part: entry.part,
      option: entry.option,
      from: 'shop',
    })
  }
  const buy = (entry: ShopEntry) => {
    const price = entry.price
    if (price === null || shortBy(price, state.wallet) > 0) return
    const bought = usePet.getState().buyRoomItem({
      item: entry.item,
      price,
      on: state.todayKey,
    })
    if (!bought) return
    analytics.capture('pet_item_bought', {
      item: entry.item,
      part: entry.part,
      price,
    })
    putOn(entry)
  }

  const wide = width >= WIDE_FROM
  const columns = Math.max(
    2,
    Math.min(
      4,
      Math.floor((gridWidth + CARD_GAP) / (CARD_MIN_WIDTH + CARD_GAP))
    )
  )
  const cardWidth =
    gridWidth > 0
      ? Math.floor((gridWidth - CARD_GAP * (columns - 1)) / columns)
      : 0

  const header = (
    <ShopHeader
      palette={palette}
      wallet={scene.reveal.shown.coins}
      monthlyHearts={state.monthlyHearts}
      onBack={() => navigation.goBack()}
    />
  )
  const previewView = (
    <ShopFrame kind='preview' palette={palette} style={{ padding: 2 * scale }}>
      <PetSceneView
        input={preview}
        viewport={wide ? VIEW_CARD : shopPreviewView(tab)}
        accessibilityLabel={
          picked && picked.state !== 'secret'
            ? i18n.t('pet.shop.previewA11y', {
                name: scene.name,
                item: roomOptionLabel(picked.part, picked.option),
              })
            : i18n.t('pet.a11y.scene', { name: scene.name })
        }
      />
    </ShopFrame>
  )
  const tabs = (
    <ShopTabs
      palette={palette}
      tab={tab}
      onChange={changeTab}
      inset={wide ? 0 : INSET}
    />
  )
  const grid = (
    <View
      onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
      style={{ gap: 14 }}
    >
      {cardWidth > 0 &&
        sections.map((section) => {
          const heading = roomSectionLabel(section.part)
          return (
            <View key={section.part} style={{ gap: 8 }}>
              {heading && (
                <Text
                  accessibilityRole='header'
                  style={{
                    fontSize: theme.fontSize('sm'),
                    fontFamily: theme.fonts.semiBold,
                    color: palette.inkAlt,
                  }}
                >
                  {heading}
                </Text>
              )}
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: CARD_GAP,
                }}
              >
                {section.entries.map((entry) => (
                  <ShopItemCard
                    key={entry.item}
                    entry={entry}
                    picked={entry.item === picked?.item}
                    isNew={isNew(entry)}
                    width={cardWidth}
                    palette={palette}
                    room={room}
                    liveNow={scene.liveNow}
                    thumbBase={scene.thumbBase}
                    onPress={() => pick(entry)}
                  />
                ))}
              </View>
            </View>
          )
        })}
    </View>
  )
  const panel = (layout: 'row' | 'stack') =>
    picked ? (
      <ShopBuyPanel
        entry={picked}
        wallet={state.wallet}
        palette={palette}
        onBuy={() => buy(picked)}
        onUse={() => putOn(picked)}
        layout={layout}
      />
    ) : null

  if (wide)
    return (
      <ShopPaper
        palette={palette}
        style={{
          flex: 1,
          paddingTop: insets.top + 8,
          // Under iPhone Duo's vertical bar too.
          marginLeft: -bleed.left,
          marginRight: -bleed.right,
          paddingLeft: bleed.left,
          paddingRight: bleed.right,
        }}
      >
        <View
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={{ flex: 1 }}
        >
          <FoldSplit
            leadingFraction={0.42}
            paddingHorizontal={24}
            gap={28}
            style={{ flex: 1 }}
            leading={
              <ScrollView
                contentContainerStyle={{
                  gap: 16,
                  paddingBottom: insets.bottom + 16,
                }}
              >
                {header}
                {previewView}
                {panel('stack')}
              </ScrollView>
            }
            trailing={
              <View style={{ flex: 1, gap: 12 }}>
                {tabs}
                <ScrollView
                  ref={itemsScroll}
                  contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
                >
                  {grid}
                </ScrollView>
              </View>
            }
          />
        </View>
      </ShopPaper>
    )

  // A sheet clears the top itself; full screen clears the status bar.
  const top =
    sheet || Platform.OS === 'android' ? sheetInsets.top - 8 : insets.top + 8
  const bottom =
    Platform.OS === 'ios' ? Math.max(insets.bottom, 12) : sheetInsets.bottom + 8
  return (
    <>
      {/* One scroll view as the sheet's root, beside only the bar
      (react-native-screens tracks the sheet's scroll view and takes at most
      two children); the room and categories stay pinned. The items sit on
      plain paper: textured as tall as all of them, it'd be one huge image. */}
      <ScrollView
        ref={itemsScroll}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ flex: 1, backgroundColor: paperColor }}
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: barHeight + 16 }}
      >
        {/* A pinned header takes its child's style for itself and drops the
        child's onLayout, so the paper sits inside a bare view. */}
        <View>
          <ShopPaper
            palette={palette}
            style={{
              paddingTop: top,
              paddingHorizontal: INSET,
              paddingBottom: 10,
              gap: 10,
            }}
          >
            {header}
            {previewView}
            {tabs}
          </ShopPaper>
        </View>
        <View style={{ paddingHorizontal: INSET }}>{grid}</View>
      </ScrollView>
      <View
        // The sheet's second child as one view, never flattened into it.
        collapsable={false}
        onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        <ShopPaper
          palette={palette}
          style={{
            borderTopWidth: 1,
            borderColor: cssColor(palette.line),
            paddingHorizontal: INSET,
            paddingTop: 10,
            paddingBottom: bottom,
          }}
        >
          {panel('row')}
        </ShopPaper>
      </View>
    </>
  )
}
