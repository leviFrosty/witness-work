import { useEffect, useRef, useState } from 'react'
import { Platform, useWindowDimensions, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import useServiceStreak from '@/hooks/useServiceStreak'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { RootStackParamList } from '@/types/rootStack'
import { GameButton } from '@/features/pet/components/GameControls'
import { GameSection, GameSwitchRow } from '@/features/pet/components/GameRows'
import GameSheet from '@/features/pet/components/GameSheet'
import PetShareCard from '@/features/pet/components/PetShareCard'
import useGamePalette from '@/features/pet/hooks/useGamePalette'
import usePetRoomScene from '@/features/pet/hooks/usePetRoomScene'
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
  const palette = useGamePalette()
  const scene = usePetRoomScene()
  const streak = useServiceStreak()
  const showStreaks = usePreferences((state) => state.showStreaks)
  const share = useSharePet()
  const card = useRef<View>(null)
  const [sharing, setSharing] = useState(false)
  // Off by default: the sign shows the User's records.
  const [showSign, setShowSign] = useState(false)
  const { width } = useWindowDimensions()

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
    <GameSheet
      title={i18n.t('pet.share.dialogTitle', { name: scene.name })}
      style={{ paddingHorizontal: SIDE_PAD }}
    >
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
        <GameSection palette={palette}>
          <GameSwitchRow
            label={i18n.t('pet.share.showSign')}
            info={i18n.t('pet.share.showSignInfo')}
            value={showSign}
            onValueChange={setShowSign}
            palette={palette}
          />
        </GameSection>
      )}
      <GameButton
        label={i18n.t('pet.shareCard.share')}
        icon='share'
        loading={sharing}
        palette={palette}
        onPress={async () => {
          setSharing(true)
          await share(card, scene.name, hasSign && showSign)
          setSharing(false)
        }}
      />
    </GameSheet>
  )
}
