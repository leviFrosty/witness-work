import { useEffect, useRef, useState } from 'react'
import { Platform, useWindowDimensions, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import ActionButton from '@/components/ui/ActionButton'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useServiceStreak from '@/hooks/useServiceStreak'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { RootStackParamList } from '@/types/rootStack'
import PetShareCard from '@/features/pet/components/PetShareCard'
import PetSheetClose from '@/features/pet/components/PetSheetClose'
import usePetRoomScene from '@/features/pet/hooks/usePetRoomScene'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'
import useSharePet from '@/features/pet/hooks/useSharePet'
import { petShareStats } from '@/features/pet/lib/share'

type Props = NativeStackScreenProps<RootStackParamList, 'PetShare'>

/** The card doesn't get wider than this (iPad, landscape). */
const CARD_MAX_WIDTH = 380
const SIDE_PAD = 20

/**
 * The pet's share sheet: its card (`PetShareCard`) as the picture will look,
 * and Share, which snapshots the card into the share sheet. Pulling the sheet
 * down closes it.
 */
export default function PetShareScreen({ navigation }: Props) {
  const theme = useTheme()
  const sheetInsets = usePetSheetInsets()
  const scene = usePetRoomScene()
  const streak = useServiceStreak()
  const showStreaks = usePreferences((state) => state.showStreaks)
  const share = useSharePet()
  const card = useRef<View>(null)
  const [sharing, setSharing] = useState(false)
  // Off by default: the sign shows the User's records.
  const [showSign, setShowSign] = useState(false)
  const { width } = useWindowDimensions()
  const sheetColor = theme.colors.sheet
  useEffect(() => {
    navigation.setOptions({ contentStyle: { backgroundColor: sheetColor } })
  }, [navigation, sheetColor])

  // Released on another device while open.
  const hasPet = scene !== null
  const focused = useIsFocused()
  useEffect(() => {
    if (!hasPet && focused) navigation.goBack()
  }, [hasPet, focused, navigation])
  if (!scene) return null

  const android = Platform.OS === 'android'
  const hasSign = scene.state.room.sign !== 'none'
  const stats = petShareStats({
    adoptedOn: scene.pet.adoptedOn,
    today: scene.state.todayKey,
    streak,
    showStreaks,
    unlocked: scene.state.unlockedItems,
  })

  return (
    <View
      style={{
        paddingHorizontal: SIDE_PAD,
        paddingTop: sheetInsets.top,
        paddingBottom: sheetInsets.bottom,
        gap: 18,
        backgroundColor: theme.colors.sheet,
        // iOS sizes the sheet to this content; Android shows it full screen.
        flex: android ? 1 : undefined,
      }}
    >
      <Text
        accessibilityRole='header'
        style={{
          fontSize: theme.fontSize('xl'),
          fontFamily: theme.fonts.bold,
        }}
      >
        {i18n.t('pet.share.dialogTitle', { name: scene.name })}
      </Text>
      <View style={{ flex: android ? 1 : undefined, justifyContent: 'center' }}>
        <PetShareCard
          ref={card}
          input={scene.input}
          name={scene.name}
          hearts={scene.life.hearts}
          gold={scene.life.gold}
          stats={stats}
          showSign={hasSign && showSign}
          maxWidth={Math.min(width - SIDE_PAD * 2, CARD_MAX_WIDTH)}
        />
      </View>
      {hasSign && (
        <View
          style={{
            borderRadius: theme.numbers.borderRadiusMd,
            backgroundColor: theme.colors.backgroundLighter,
            overflow: 'hidden',
          }}
        >
          <InputRowSwitch
            label={i18n.t('pet.share.showSign')}
            info={i18n.t('pet.share.showSignInfo')}
            value={showSign}
            onValueChange={setShowSign}
            lastInSection
          />
        </View>
      )}
      <ActionButton
        loading={sharing}
        disabled={sharing}
        onPress={async () => {
          setSharing(true)
          await share(card, scene.name, hasSign && showSign)
          setSharing(false)
        }}
      >
        {i18n.t('pet.shareCard.share')}
      </ActionButton>
      <PetSheetClose />
    </View>
  )
}
