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
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import usePet from '@/stores/pet'
import { toast } from '@/stores/toasts'
import type { RootStackParamList } from '@/types/rootStack'
import { resolveRoom, VIEW_CARD } from '@/features/pet/art'
import { cssColor, gamePalette } from '@/features/pet/art/gameUi'
import ShopBuyPanel from '@/features/pet/components/ShopBuyPanel'
import ShopHeader from '@/features/pet/components/ShopHeader'
import ShopItemCard from '@/features/pet/components/ShopItemCard'
import { itemGridColumns } from '@/features/pet/components/GameItemCard'
import {
  GameFrame,
  GamePaper,
  gamePixelScale,
} from '@/features/pet/components/GamePixels'
import GameTabs from '@/features/pet/components/GameTabs'
import usePetDark from '@/features/pet/hooks/usePetDark'
import usePetRoomScene from '@/features/pet/hooks/usePetRoomScene'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'
import {
  roomOptionLabel,
  roomSectionLabel,
} from '@/features/pet/lib/roomLabels'
import { roomChoicePatch, roomWithChoice } from '@/features/pet/lib/roomOptions'
import { noteRoomItemPicked } from '@/features/pet/lib/secrets'
import { shortBy, SHOP_TABS, type ShopTab } from '@/features/pet/lib/shop'
import {
  PET_WIDE_FROM,
  petOpensAsSheet,
} from '@/features/pet/lib/petPresentation'
import {
  isForSale,
  shopEntries,
  shopPreviewView,
  type ShopEntry,
} from '@/features/pet/lib/shopEntries'
import { unlockedPart, unlockTab } from '@/features/pet/lib/unlockNews'
import PetSceneView from '@/features/pet/render/PetSceneView'
import type { RoomItemId } from '@/types/pet'

type Props = NativeStackScreenProps<RootStackParamList, 'PetShop'>
/** Side padding of the narrow layout. */
const INSET = 16
/** Between cards, besides the room each card keeps for its ring. */
const CARD_GAP = 4

/** The category an item from the pet's details (`focus`) belongs to. */
function tabOf(focus: string | undefined): ShopTab {
  if (!focus) return 'hat'
  const tab = unlockTab(unlockedPart(focus as RoomItemId).part)
  return (SHOP_TABS as readonly string[]).includes(tab)
    ? (tab as ShopTab)
    : 'hat'
}

/**
 * The Shop (ADR 0035): where hats and room items are bought with coins, kept
 * apart from the pet's details, which hold what's owned. The room on top tries
 * on whatever's picked; the categories and the items below it scroll, starters
 * left out, owned ones marked. The picked item's button buys it, which puts it
 * on at once. Side by side from 760 points wide, meeting at iPhone Duo's fold.
 */
export default function PetShopScreen({ navigation, route }: Props) {
  const theme = useTheme()
  const palette = gamePalette(usePetDark())
  const scale = gamePixelScale()
  const insets = useSafeAreaInsets()
  const sheetInsets = usePetSheetInsets()
  const bleed = useHorizontalBleed()
  const window = useWindowDimensions()
  // As RootStack presented it, when it opened.
  const [sheet] = useState(petOpensAsSheet)
  const scene = usePetRoomScene()
  const focus = route.params?.focus
  const [tab, setTab] = useState<ShopTab>(() => tabOf(focus))
  const [pickedItem, setPickedItem] = useState<string | null>(focus ?? null)
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
  // What was picked, else the first thing still to buy.
  const picked =
    entries.find((entry) => entry.item === pickedItem) ??
    entries.find(isForSale) ??
    entries[0]

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
  const pick = (entry: ShopEntry) => setPickedItem(entry.item)
  // A bought item goes on at once, so it's never "New".
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
    // It stays picked, Owned, rather than the next one for sale.
    setPickedItem(entry.item)
    Haptics.success()
    const item = roomOptionLabel(entry.part, entry.option)
    toast.success(
      entry.part === 'hat'
        ? i18n.t('pet.shop.boughtHat', { item, name: scene.name })
        : i18n.t('pet.shop.boughtRoom', { item, name: scene.name })
    )
  }

  const wide = width >= PET_WIDE_FROM
  const { cardWidth } = itemGridColumns(gridWidth, CARD_GAP)

  const header = (
    <ShopHeader
      palette={palette}
      wallet={scene.reveal.shown.coins}
      walletPulse={scene.reveal.coins}
      monthlyHearts={state.monthlyHearts}
      onBack={() => navigation.goBack()}
    />
  )
  const previewView = (
    <GameFrame kind='preview' palette={palette} style={{ padding: 2 * scale }}>
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
    </GameFrame>
  )
  const tabs = (
    <GameTabs
      palette={palette}
      tabs={SHOP_TABS}
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
        petName={scene.name}
        palette={palette}
        onBuy={() => buy(picked)}
        layout={layout}
      />
    ) : null

  if (wide)
    return (
      <GamePaper
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
      </GamePaper>
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
          <GamePaper
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
          </GamePaper>
        </View>
        <View style={{ paddingHorizontal: INSET }}>{grid}</View>
      </ScrollView>
      <View
        // The sheet's second child as one view, never flattened into it.
        collapsable={false}
        onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        <GamePaper
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
        </GamePaper>
      </View>
    </>
  )
}
