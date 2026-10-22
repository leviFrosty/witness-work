import { useEffect, useState } from 'react'
import { Platform, ScrollView, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import {
  PawPrint as PawPrintIcon,
  Pencil as PencilIcon,
  Share as ShareIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import ChoiceChips from '@/components/ui/ChoiceChips'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import usePet from '@/stores/pet'
import type { RootStackParamList } from '@/types/rootStack'
import PetCardHeader from '@/features/pet/components/PetCardHeader'
import RoomLiveWindowRow from '@/features/pet/components/RoomLiveWindowRow'
import RoomOptionGrid from '@/features/pet/components/RoomOptionGrid'
import { ROOM_TAB_ICONS } from '@/features/pet/components/roomTabIcons'
import usePetRoomScene from '@/features/pet/hooks/usePetRoomScene'
import { roomTabLabel, unlockNoteText } from '@/features/pet/lib/roomLabels'
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
  type RoomUnlocks,
} from '@/features/pet/lib/roomOptions'
import { noteSecretFound } from '@/features/pet/lib/secrets'
import PetSceneView from '@/features/pet/render/PetSceneView'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'
import PetSheetClose from '@/features/pet/components/PetSheetClose'

type Props = NativeStackScreenProps<RootStackParamList, 'PetRoom'>

/** Wider previews only make the sheet taller (iPad, landscape). */
const PREVIEW_MAX_WIDTH = 420

/** A labelled pill under the pet's name: Rename, Change pet, Share. */
function ActionPill({
  icon,
  label,
  onPress,
}: {
  icon: AppIcon
  label: string
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      accessibilityRole='button'
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 99,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <LucideIcon icon={icon} size={15} color={theme.colors.text} />
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {label}
      </Text>
    </Button>
  )
}

/**
 * The pet's details, opened from its Home card: its name and hearts, quick
 * Rename / Change pet / Share, and the room live with a tab per part (its hat
 * first), each part's options drawn from the room itself. A choice applies and
 * saves at once; pulling the sheet down closes it.
 */
export default function PetRoomScreen({ navigation }: Props) {
  const theme = useTheme()
  const sheetInsets = usePetSheetInsets()
  // Android shows it full screen: the pinned room stops below the status bar.
  const insets = useSafeAreaInsets()
  const statusBar = Platform.OS === 'android' ? insets.top : 0
  const scene = usePetRoomScene()
  const [tab, setTab] = useState<RoomTab>('hat')
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
  const unlocks: RoomUnlocks = {
    unlocked: state.unlockedItems,
    mode: state.unlockMode,
    streakKind: state.streakKind,
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
    <>
      {/* One scroll view as the sheet's root (react-native-screens tracks the
      sheet's first scroll view); the room and tabs stay pinned under the name. */}
      <ScrollView
        style={{
          flex: 1,
          marginTop: statusBar,
          backgroundColor: theme.colors.sheet,
        }}
        stickyHeaderIndices={[1]}
        contentContainerStyle={{
          // iOS adds the bottom inset below the sheet itself.
          paddingBottom: Platform.OS === 'ios' ? 24 : sheetInsets.bottom + 8,
        }}
      >
        <View
          style={{
            paddingTop: sheetInsets.top - statusBar,
            paddingHorizontal: 20,
            paddingBottom: 14,
            gap: 12,
          }}
        >
          <View accessibilityRole='header'>
            <PetCardHeader name={scene.name} life={scene.life} size='xl' />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <ActionPill
              icon={PencilIcon}
              label={i18n.t('pet.details.rename')}
              onPress={() => navigation.navigate('PetRename')}
            />
            <ActionPill
              icon={PawPrintIcon}
              label={i18n.t('pet.details.change')}
              onPress={() =>
                navigation.navigate('PetPicker', { mode: 'change' })
              }
            />
            <ActionPill
              icon={ShareIcon}
              label={i18n.t('pet.details.share')}
              onPress={() => {
                analytics.capture('pet_share_opened', { from: 'details' })
                navigation.navigate('PetShare')
              }}
            />
          </View>
        </View>
        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: 16,
            backgroundColor: theme.colors.sheet,
          }}
        >
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
              accessibilityLabel={i18n.t('pet.a11y.scene', {
                name: scene.name,
              })}
              accessibilityHint={i18n.t('pet.a11y.patHint')}
              onTwirl={() => noteSecretFound('twirl')}
            />
          </View>
          <ChoiceChips
            accessibilityLabel={i18n.t('pet.room.tabs')}
            options={ROOM_TABS.map((key) => ({
              key,
              label: roomTabLabel(key),
              icon: ROOM_TAB_ICONS[key],
            }))}
            value={tab}
            onChange={setTab}
            layout='scroll'
            bleed={20}
            fadeColor={theme.colors.sheet}
          />
        </View>
        <View style={{ paddingHorizontal: 20, paddingTop: 2, gap: 18 }}>
          {/* How locked ones open up; each also shows its own number. */}
          {anyLocked && (
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {unlockNoteText(unlocks.mode, unlocks.streakKind, tab)}
            </Text>
          )}
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
        </View>
      </ScrollView>
      <PetSheetClose />
    </>
  )
}
