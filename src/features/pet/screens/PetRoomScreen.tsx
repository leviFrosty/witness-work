import { useEffect, useState } from 'react'
import { Platform, ScrollView, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import ChoiceChips from '@/components/ui/ChoiceChips'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import usePet from '@/stores/pet'
import type { RootStackParamList } from '@/types/rootStack'
import RoomLiveWindowRow from '@/features/pet/components/RoomLiveWindowRow'
import RoomOptionGrid from '@/features/pet/components/RoomOptionGrid'
import usePetRoomScene from '@/features/pet/hooks/usePetRoomScene'
import { roomTabLabel } from '@/features/pet/lib/roomLabels'
import {
  isLiveWindow,
  isRoomChoiceUnlocked,
  liveWindowPatch,
  ROOM_TABS,
  roomChoicePatch,
  roomTabSections,
  selectedRoomOption,
  type RoomChoicePart,
  type RoomTab,
} from '@/features/pet/lib/roomOptions'
import PetSceneView from '@/features/pet/render/PetSceneView'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'

type Props = NativeStackScreenProps<RootStackParamList, 'PetRoom'>

/** Wider previews only make the sheet taller (iPad, landscape). */
const PREVIEW_MAX_WIDTH = 420

/**
 * Decorate Room: the room live at the top, then a tab per part with its options
 * drawn from the room itself. A choice applies and saves at once; pulling the
 * sheet down closes it.
 */
export default function PetRoomScreen({ navigation }: Props) {
  const theme = useTheme()
  const sheetInsets = usePetSheetInsets()
  const scene = usePetRoomScene()
  const [tab, setTab] = useState<RoomTab>('window')
  const sheetColor = theme.colors.sheet
  useEffect(() => {
    navigation.setOptions({ contentStyle: { backgroundColor: sheetColor } })
  }, [navigation, sheetColor])

  // Released on another device while open.
  const hasPet = scene !== null
  // Closes once it's on top again, so it never pops a screen above it.
  const focused = useIsFocused()
  useEffect(() => {
    if (!hasPet && focused) navigation.goBack()
  }, [hasPet, focused, navigation])
  if (!scene) return null

  const { state, window } = scene
  const room = state.room
  const unlocks = {
    unlocked: state.unlockedItems as ReadonlySet<string>,
    activeMonths: state.activeMonths,
    thisMonthActive: state.thisMonthActive,
  }

  const choose = (part: RoomChoicePart, option: string) => {
    if (!isRoomChoiceUnlocked(part, option, unlocks.unlocked)) return
    if (selectedRoomOption(room, part) === option) return
    usePet
      .getState()
      .updateRoom(roomChoicePatch(room, part, option), state.roomDefaults)
    analytics.capture('pet_room_changed', { part, option })
  }

  const setLive = (live: boolean) => {
    usePet
      .getState()
      .updateRoom(liveWindowPatch(live, window), state.roomDefaults)
    analytics.capture('pet_room_changed', {
      part: 'window',
      option: live ? 'live' : 'fixed',
    })
  }

  const sections = roomTabSections(tab, room)
  const anyLocked = sections.some((section) =>
    section.options.some(
      (option) => !isRoomChoiceUnlocked(section.part, option, unlocks.unlocked)
    )
  )

  return (
    // One scroll view as the sheet's root (react-native-screens tracks the
    // sheet's first scroll view); the title, room and tabs stay pinned on top.
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.sheet }}
      stickyHeaderIndices={[0]}
      contentContainerStyle={{
        // iOS adds the bottom inset below the sheet itself.
        paddingBottom: Platform.OS === 'ios' ? 24 : sheetInsets.bottom + 8,
      }}
    >
      <View
        style={{
          paddingTop: sheetInsets.top,
          paddingHorizontal: 20,
          paddingBottom: 16,
          backgroundColor: theme.colors.sheet,
        }}
      >
        <Text
          accessibilityRole='header'
          numberOfLines={1}
          style={{
            marginBottom: 14,
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('pet.room.title', { name: scene.name })}
        </Text>
        <View
          style={{
            width: '100%',
            maxWidth: PREVIEW_MAX_WIDTH,
            alignSelf: 'center',
            // The sticky header's wrapper drops `gap`.
            marginBottom: 14,
          }}
        >
          <PetSceneView
            input={scene.input}
            borderRadius={theme.numbers.borderRadiusMd}
            accessibilityLabel={i18n.t('pet.a11y.scene', { name: scene.name })}
          />
        </View>
        <ChoiceChips
          accessibilityLabel={i18n.t('pet.room.tabs')}
          options={ROOM_TABS.map((key) => ({
            key,
            label: roomTabLabel(key),
          }))}
          value={tab}
          onChange={setTab}
        />
      </View>
      <View style={{ paddingHorizontal: 20, paddingTop: 2, gap: 18 }}>
        {tab === 'window' && (
          <RoomLiveWindowRow
            live={isLiveWindow(room.window)}
            onChange={setLive}
          />
        )}
        {sections.map((section) => (
          <RoomOptionGrid
            key={section.part}
            section={section}
            room={room}
            liveNow={scene.liveNow}
            thumbBase={scene.thumbBase}
            unlocks={unlocks}
            onSelect={(option) => choose(section.part, option)}
          />
        ))}
        {anyLocked && (
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('pet.room.unlockNote')}
          </Text>
        )}
      </View>
    </ScrollView>
  )
}
