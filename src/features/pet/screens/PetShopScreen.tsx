import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Platform, ScrollView, useWindowDimensions, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useReducedMotion } from 'react-native-reanimated'
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
import { resolveRoom, VIEW_CARD, WALL_RGB } from '@/features/pet/art'
import { cssColor, gamePalette } from '@/features/pet/art/gameUi'
import HatPreviewTray from '@/features/pet/components/HatPreviewTray'
import ShopBuyPanel from '@/features/pet/components/ShopBuyPanel'
import ShopHeader from '@/features/pet/components/ShopHeader'
import ShopItemCard from '@/features/pet/components/ShopItemCard'
import GameColorSwatches from '@/features/pet/components/GameColorSwatches'
import GameColorTray from '@/features/pet/components/GameColorTray'
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
  shopItemLabel,
} from '@/features/pet/lib/roomLabels'
import { hatReactions } from '@/features/pet/lib/hatReactions'
import { roomChoicePatch, roomWithChoice } from '@/features/pet/lib/roomOptions'
import { noteRoomItemPicked } from '@/features/pet/lib/secrets'
import { shortBy, SHOP_TABS, type ShopTab } from '@/features/pet/lib/shop'
import { storedPrice } from '@/features/pet/lib/currency'
import {
  PET_WIDE_FROM,
  petOpensAsSheet,
} from '@/features/pet/lib/petPresentation'
import {
  isOwned,
  pickedEntry,
  shopEntries,
  shopPreviewView,
  type ShopEntry,
} from '@/features/pet/lib/shopEntries'
import { unlockedPart, unlockTab } from '@/features/pet/lib/unlockNews'
import PetSceneView, {
  type PetSceneHandle,
} from '@/features/pet/render/PetSceneView'
import type { RoomItemId, WallColor } from '@/types/pet'

type Props = NativeStackScreenProps<RootStackParamList, 'PetShop'>

const INSET = 16

const CARD_GAP = 4

const SECTION_ROW_GAP = 8

function tabOf(focus: string | undefined): ShopTab {
  if (!focus) return 'hat'
  const tab = unlockTab(unlockedPart(focus as RoomItemId).part)
  return (SHOP_TABS as readonly string[]).includes(tab)
    ? (tab as ShopTab)
    : 'hat'
}

export default function PetShopScreen({ navigation, route }: Props) {
  const theme = useTheme()
  const palette = gamePalette(usePetDark())
  const scale = gamePixelScale()
  const insets = useSafeAreaInsets()
  const sheetInsets = usePetSheetInsets()
  const bleed = useHorizontalBleed()
  const window = useWindowDimensions()

  const [sheet] = useState(petOpensAsSheet)
  const scene = usePetRoomScene()
  const focus = route.params?.focus
  const [tab, setTab] = useState<ShopTab>(() => tabOf(focus))
  const [pickedItem, setPickedItem] = useState<string | null>(focus ?? null)

  const [lastPattern, setLastPattern] = useState<string | null>(null)

  const [width, setWidth] = useState(window.width)
  const [gridWidth, setGridWidth] = useState(0)
  const [barHeight, setBarHeight] = useState(0)

  const itemsScroll = useRef<ScrollView>(null)
  const previewRef = useRef<PetSceneHandle>(null)
  const reduceMotion = useReducedMotion()

  const from = route.params?.from ?? 'room'
  useEffect(() => {
    analytics.capture('pet_shop_opened', { from })
  }, [from])

  const paperColor = cssColor(palette.paper)
  useEffect(() => {
    navigation.setOptions({ contentStyle: { backgroundColor: paperColor } })
  }, [navigation, paperColor])

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

  const picked = pickedEntry(entries, pickedItem)

  const pattern =
    picked?.part === 'wallPattern'
      ? picked
      : entries.find((entry) => entry.item === lastPattern)
  const colors = sections.find((section) => section.part === 'wallColor')

  let tryOn =
    picked && picked.state !== 'secret'
      ? roomWithChoice(room, picked.part, picked.option)
      : room
  if (picked?.part === 'wallColor' && pattern && pattern.state !== 'secret')
    tryOn = roomWithChoice(tryOn, pattern.part, pattern.option)
  const preview = {
    ...scene.input,
    room: resolveRoom(tryOn, scene.window),
  }

  const changeTab = (next: ShopTab) => {
    setTab(next)
    setPickedItem(null)
    setLastPattern(null)
    itemsScroll.current?.scrollTo({ y: 0, animated: false })
  }

  const pick = (entry: ShopEntry) => {
    setPickedItem(entry.item)
    if (hatReactions(entry.item).length > 0) previewRef.current?.hatPat()

    if (entry.part === 'wallPattern') setLastPattern(entry.item)
    else if (entry.part === 'wallColor' && pattern) setLastPattern(pattern.item)
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
      price: storedPrice(price),
      on: state.todayKey,
    })
    if (!bought) return
    analytics.capture('pet_item_bought', {
      item: entry.item,
      part: entry.part,
      price,
    })
    putOn(entry)

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
  const { columns, cardWidth } = itemGridColumns(gridWidth, CARD_GAP)

  const sectionHeading = (text: string) => (
    <Text
      accessibilityRole='header'
      style={{
        fontSize: theme.fontSize('sm'),
        fontFamily: theme.fonts.semiBold,
        color: palette.inkAlt,
      }}
    >
      {text}
    </Text>
  )

  const colorTray = (column: number | null) =>
    colors && (
      <GameColorTray
        column={column}
        cardWidth={cardWidth}
        cardGap={CARD_GAP}
        gap={SECTION_ROW_GAP}
        palette={palette}
      >
        {sectionHeading(roomSectionLabel(colors.part) ?? '')}
        <GameColorSwatches
          accessibilityRole='none'
          palette={palette}
          swatches={colors.entries.map((entry) => ({
            key: entry.item,
            color:
              entry.state === 'secret'
                ? null
                : WALL_RGB[entry.option as WallColor],
            label: shopItemLabel(
              entry,
              roomOptionLabel(entry.part, entry.option)
            ),
            picked: entry.item === picked?.item,
            owned: isOwned(entry),
          }))}
          onPress={(item) => {
            const entry = colors.entries.find((e) => e.item === item)
            if (entry) pick(entry)
          }}
        />
      </GameColorTray>
    )

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
        ref={previewRef}
        input={preview}
        viewport={
          wide
            ? VIEW_CARD
            : shopPreviewView(tab, picked?.option, scene.input.hatLife?.growth)
        }
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
      {}
      {cardWidth > 0 && !pattern && colorTray(null)}
      {cardWidth > 0 &&
        sections
          .filter((section) => section !== colors)
          .map((section) => {
            const heading = roomSectionLabel(section.part)
            const cards = section.entries.map((entry) => (
              <ShopItemCard
                key={entry.item}
                entry={entry}
                picked={entry.item === picked?.item || entry === pattern}
                width={cardWidth}
                palette={palette}
                room={room}
                liveNow={scene.liveNow}
                thumbBase={scene.thumbBase}
                onPress={() => pick(entry)}
              />
            ))
            const at = pattern ? section.entries.indexOf(pattern) : -1
            const hung = colors && section.part === 'wallPattern' && at >= 0
            const previewAt =
              picked && !reduceMotion && hatReactions(picked.item).length > 0
                ? section.entries.indexOf(picked)
                : -1
            const hangsAt = hung ? at : previewAt
            const split =
              hangsAt >= 0
                ? (Math.floor(hangsAt / columns) + 1) * columns
                : cards.length
            const cardRows = (items: ReactElement[]) => (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: CARD_GAP,
                }}
              >
                {items}
              </View>
            )
            return (
              <View key={section.part} style={{ gap: SECTION_ROW_GAP }}>
                {heading && sectionHeading(heading)}
                {cardRows(cards.slice(0, split))}
                {hung && colorTray(at % columns)}
                {picked && previewAt >= 0 && (
                  <HatPreviewTray
                    hat={picked.option}
                    hatName={roomOptionLabel(picked.part, picked.option)}
                    petName={scene.name}
                    scene={previewRef}
                    from='shop'
                    column={previewAt % columns}
                    cardWidth={cardWidth}
                    cardGap={CARD_GAP}
                    gap={SECTION_ROW_GAP}
                    palette={palette}
                  />
                )}
                {split < cards.length && cardRows(cards.slice(split))}
              </View>
            )
          })}
    </View>
  )
  const panel = (layout: 'row' | 'stack') => (
    <ShopBuyPanel
      entry={picked ?? null}
      wallet={state.wallet}
      petName={scene.name}
      palette={palette}
      onBuy={() => picked && buy(picked)}
      layout={layout}
      noteShown={
        !!picked && !reduceMotion && hatReactions(picked.item).length > 0
      }
    />
  )

  if (wide)
    return (
      <GamePaper
        palette={palette}
        style={{
          flex: 1,
          paddingTop: insets.top + 8,

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

  const top =
    sheet || Platform.OS === 'android' ? sheetInsets.top - 8 : insets.top + 8
  const bottom =
    Platform.OS === 'ios' ? Math.max(insets.bottom, 12) : sheetInsets.bottom + 8
  return (
    <>
      {}
      <ScrollView
        ref={itemsScroll}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ flex: 1, backgroundColor: paperColor }}
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: barHeight + 16 }}
      >
        {}
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
