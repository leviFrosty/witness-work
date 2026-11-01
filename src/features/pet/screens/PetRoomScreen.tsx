import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Platform, ScrollView, useWindowDimensions, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import Button from '@/components/ui/Button'
import FoldSplit from '@/components/ui/layout/FoldSplit'
import { useHorizontalBleed } from '@/components/ui/layout/HorizontalSafeArea'
import Text from '@/components/ui/MyText'
import Popover from '@/components/ui/Popover'
import { unlockedPart, unlockTab } from '@/features/pet/lib/unlockNews'
import { settleAllPetUnlocks } from '@/features/pet/stores/petUnlockNews'
import type { PetVisit, RoomItemId } from '@/types/pet'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import usePet from '@/stores/pet'
import type { RootStackParamList } from '@/types/rootStack'
import { cssColor, type GamePalette } from '@/features/pet/art/gameUi'
import {
  GameButton,
  GameIconButton,
} from '@/features/pet/components/GameControls'
import GameItemCard, {
  CheckNote,
  itemGridColumns,
  MoreInShopCard,
} from '@/features/pet/components/GameItemCard'
import {
  GameFrame,
  GamePaper,
  gamePixelScale,
} from '@/features/pet/components/GamePixels'
import { GameSection, GameSwitchRow } from '@/features/pet/components/GameRows'
import { useGameSheetBackground } from '@/features/pet/components/GameSheet'
import GameTabs from '@/features/pet/components/GameTabs'
import GameWallet from '@/features/pet/components/GameWallet'
import PetCardHeader from '@/features/pet/components/PetCardHeader'
import useGamePalette from '@/features/pet/hooks/useGamePalette'
import usePetRoomScene from '@/features/pet/hooks/usePetRoomScene'
import {
  roomOptionLabel,
  roomSectionLabel,
} from '@/features/pet/lib/roomLabels'
import {
  isNewOption,
  lockerSections,
  tabsWithNew,
  type LockerSection,
} from '@/features/pet/lib/locker'
import {
  isLiveWindow,
  liveWindowPatch,
  ROOM_TABS,
  roomChoicePatch,
  type RoomTab,
} from '@/features/pet/lib/roomOptions'
import {
  noteRoomItemPicked,
  noteSecretFound,
  roomItemPicked,
} from '@/features/pet/lib/secrets'
import {
  PET_WIDE_FROM,
  petOpensAsSheet,
} from '@/features/pet/lib/petPresentation'
import PetSceneView, {
  type PetSceneHandle,
} from '@/features/pet/render/PetSceneView'
import { usePetSession } from '@/features/pet/stores/petSession'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'
import PetVisitsSummary from '@/features/pet/components/PetVisitsSummary'
import useShownPetVisits from '@/features/pet/hooks/useShownPetVisits'

type Props = NativeStackScreenProps<RootStackParamList, 'PetRoom'> & {
  visits: readonly PetVisit[]
}

const PREVIEW_MAX_WIDTH = 420

const INSET = 16

const CARD_GAP = 4

const CORNER_GAP = 12
const INFO_WIDTH = 280

function HeartsInfo({
  hearts,
  count,
  monthlyHearts,
  palette,
}: {
  hearts: ReactElement
  count: number
  monthlyHearts: boolean
  palette: GamePalette
}) {
  const theme = useTheme()
  return (
    <Popover
      contentWidth={INFO_WIDTH}
      backgroundColor={cssColor(palette.card)}
      style={{ alignSelf: 'flex-start' }}
      renderTrigger={({ onPress }) => (
        <Button
          onPress={onPress}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('pet.a11y.hearts', { count })}
          accessibilityHint={i18n.t('pet.hearts.infoTitle')}
          pointerEffect='highlight'
          style={{ paddingVertical: 17, marginVertical: -17 }}
        >
          {hearts}
        </Button>
      )}
    >
      <View style={{ gap: 4 }}>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: palette.ink,
          }}
        >
          {i18n.t('pet.hearts.infoTitle')}
        </Text>
        <Text style={{ fontSize: theme.fontSize('sm'), color: palette.inkAlt }}>
          {i18n.t(
            monthlyHearts
              ? 'pet.intro.hearts.bodyMonths'
              : 'pet.intro.hearts.body'
          )}
        </Text>
      </View>
    </Popover>
  )
}

function inUseText(section: LockerSection, tabSections: number): string {
  const { part, current } = section
  const item = roomOptionLabel(part, current)
  if (part === 'hat')
    return current === 'none'
      ? i18n.t('pet.locker.noHat')
      : i18n.t('pet.locker.wearing', { item })
  return tabSections > 1
    ? i18n.t('pet.locker.current', {
        section: roomSectionLabel(part) ?? '',
        item,
      })
    : i18n.t('pet.locker.inRoom', { item })
}

export default function PetRoomScreen({
  navigation,
  route,
  visits: realVisits,
}: Props) {
  const theme = useTheme()
  const palette = useGamePalette()
  const sheetInsets = usePetSheetInsets()
  const insets = useSafeAreaInsets()
  const bleed = useHorizontalBleed()
  const screen = useWindowDimensions()

  const [sheet] = useState(petOpensAsSheet)

  const statusBar = Platform.OS === 'android' ? insets.top : 0
  const scene = usePetRoomScene()

  const focus = route.params?.focus
  const [tab, setTab] = useState<RoomTab>(() =>
    focus ? unlockTab(unlockedPart(focus as RoomItemId).part) : 'hat'
  )

  const [width, setWidth] = useState(screen.width)
  const [gridWidth, setGridWidth] = useState(0)

  useEffect(() => {
    settleAllPetUnlocks()
  }, [])
  useGameSheetBackground(palette)

  const hasPet = scene !== null

  const focused = useIsFocused()
  useEffect(() => {
    if (!hasPet && focused) navigation.goBack()
  }, [hasPet, focused, navigation])

  const sceneRef = useRef<PetSceneHandle>(null)
  const entrancePending = usePetSession((s) => s.entrance !== null)
  const visits = useShownPetVisits(realVisits)
  useEffect(() => {
    if (!focused || !hasPet) return
    const species = usePetSession.getState().takeEntrance()
    if (species) sceneRef.current?.playEntrance(species)
  }, [focused, hasPet])

  const inRoom = scene
    ? ROOM_TABS.flatMap((key) =>
        lockerSections(key, scene.state.room, scene.state.unlockedItems).map(
          ({ part, current }) => `${part}:${current}`
        )
      ).join(' ')
    : ''
  useEffect(() => {
    for (const item of inRoom.split(' ')) if (item) noteRoomItemPicked(item)
  }, [inRoom])

  if (!scene) return null

  const { state, window } = scene
  const room = state.room
  const unlocked = state.unlockedItems
  const paper = cssColor(palette.paper)

  const choose = (section: LockerSection, option: string) => {
    const { part } = section
    if (option === section.current) return
    noteRoomItemPicked(`${part}:${option}`)
    usePet
      .getState()
      .updateRoom(roomChoicePatch(room, part, option), state.roomDefaults)
    analytics.capture('pet_room_changed', { part, option, from: 'room' })
  }

  const setLive = (live: boolean) => {
    usePet
      .getState()
      .updateRoom(liveWindowPatch(live, window), state.roomDefaults)
    analytics.capture('pet_room_changed', {
      part: 'window',
      option: live ? 'live' : 'fixed',
      from: 'room',
    })
  }

  const openShop = (from: 'room' | 'more', item?: string) =>
    navigation.navigate('PetShop', { from, focus: item })

  const sections = lockerSections(tab, room, unlocked)
  const dots = tabsWithNew(room, unlocked, roomItemPicked)
  const { cardWidth } = itemGridColumns(gridWidth, CARD_GAP)
  const wide = width >= PET_WIDE_FROM

  const header = (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View accessibilityRole='header' style={{ flex: 1, paddingTop: 4 }}>
          <PetCardHeader
            name={scene.name}
            life={scene.shownLife}
            size='xl'
            heartPulse={scene.reveal.heart}
            ink={{ text: palette.ink, alt: palette.inkAlt }}
            wrapHearts={(hearts) => (
              <HeartsInfo
                hearts={hearts}
                count={scene.shownLife.hearts}
                monthlyHearts={state.monthlyHearts}
                palette={palette}
              />
            )}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: CORNER_GAP }}>
          <GameIconButton
            icon='share'
            label={i18n.t('pet.details.share')}
            palette={palette}
            onPress={() => {
              analytics.capture('pet_share_opened', { from: 'details' })
              navigation.navigate('PetShare')
            }}
          />
          <GameIconButton
            icon='settings'
            label={i18n.t('pet.details.settings')}
            palette={palette}
            onPress={() => navigation.navigate('PetSettings')}
          />
          {!sheet && (
            <GameIconButton
              icon='close'
              label={i18n.t('close')}
              palette={palette}
              onPress={() => navigation.goBack()}
            />
          )}
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <GameWallet
          palette={palette}
          coins={scene.reveal.shown.coins}
          pulse={scene.reveal.coins}
          monthlyHearts={state.monthlyHearts}
        />
        <GameButton
          label={i18n.t('pet.details.shop')}
          icon='shop'
          palette={palette}
          onPress={() => openShop('room')}
        />
      </View>
      <PetVisitsSummary visits={visits} palette={palette} />
    </View>
  )
  const preview = (
    <GameFrame
      kind='preview'
      palette={palette}
      style={{
        width: '100%',
        maxWidth: PREVIEW_MAX_WIDTH,
        alignSelf: 'center',
        padding: 2 * gamePixelScale(),
      }}
    >
      <PetSceneView
        ref={sceneRef}
        input={entrancePending ? { ...scene.input, pet: null } : scene.input}
        accessibilityLabel={i18n.t('pet.a11y.scene', {
          name: scene.name,
        })}
        accessibilityHint={i18n.t('pet.a11y.patHint')}
        onTwirl={() => noteSecretFound('twirl')}
      />
    </GameFrame>
  )
  const tabs = (
    <GameTabs
      palette={palette}
      tabs={ROOM_TABS}
      tab={tab}
      onChange={setTab}
      inset={wide ? 0 : INSET}
      dots={dots}
    />
  )
  const grid = (
    <View
      onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
      style={{
        marginHorizontal: wide ? 0 : INSET,
        paddingTop: wide ? 0 : 10,
        gap: 18,
      }}
    >
      {tab === 'window' && (
        <GameSection palette={palette}>
          <GameSwitchRow
            label={i18n.t('pet.room.liveWindow')}
            info={i18n.t('pet.room.liveWindowInfo')}
            value={isLiveWindow(room.window)}
            onValueChange={setLive}
            palette={palette}
          />
        </GameSection>
      )}
      {cardWidth > 0 &&
        sections.map((section) => (
          <View key={section.part} style={{ gap: 8 }}>
            <Text
              accessibilityRole='header'
              numberOfLines={2}
              style={{
                fontSize: theme.fontSize('sm'),
                fontFamily: theme.fonts.semiBold,
                color: palette.ink,
              }}
            >
              {inUseText(section, sections.length)}
            </Text>
            <View
              accessibilityRole='radiogroup'
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: CARD_GAP,
              }}
            >
              {section.owned.map((option) => {
                const inUse = option === section.current
                const name = roomOptionLabel(section.part, option)
                const isNew = isNewOption(
                  section.part,
                  option,
                  section.current,
                  roomItemPicked
                )
                return (
                  <GameItemCard
                    key={option}
                    part={section.part}
                    option={option}
                    name={name}
                    note={
                      inUse ? (
                        <CheckNote
                          label={
                            section.part === 'hat'
                              ? i18n.t('pet.shop.wearing')
                              : i18n.t('pet.shop.inRoom')
                          }
                          palette={palette}
                        />
                      ) : null
                    }
                    picked={inUse}
                    isNew={isNew}
                    width={cardWidth}
                    palette={palette}
                    room={room}
                    liveNow={scene.liveNow}
                    thumbBase={scene.thumbBase}
                    onPress={() => choose(section, option)}
                    accessibilityRole='radio'
                    accessibilityState={{ checked: inUse }}
                    accessibilityLabel={
                      isNew
                        ? i18n.t('pet.room.secret.newA11y', {
                            option: name,
                          })
                        : name
                    }
                  />
                )
              })}
              {section.nextForSale && (
                <MoreInShopCard
                  count={section.forSale}
                  width={cardWidth}
                  palette={palette}
                  onPress={() =>
                    openShop('more', section.nextForSale ?? undefined)
                  }
                />
              )}
            </View>
          </View>
        ))}
    </View>
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
                {preview}
              </ScrollView>
            }
            trailing={
              <View style={{ flex: 1, gap: 12 }}>
                {tabs}
                <ScrollView
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

  return (
    <>
      {}
      <ScrollView
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ flex: 1, marginTop: statusBar, backgroundColor: paper }}
        stickyHeaderIndices={[1]}
        contentContainerStyle={{
          paddingBottom: Platform.OS === 'ios' ? 24 : sheetInsets.bottom + 8,
        }}
      >
        <GamePaper
          palette={palette}
          style={{
            paddingTop: sheetInsets.top - statusBar - 8,
            paddingHorizontal: INSET,
            paddingBottom: 12,
          }}
        >
          {header}
        </GamePaper>
        {}
        <View>
          <GamePaper
            palette={palette}
            style={{ paddingHorizontal: INSET, paddingBottom: 4, gap: 10 }}
          >
            {preview}
            {tabs}
          </GamePaper>
        </View>
        {grid}
      </ScrollView>
    </>
  )
}
