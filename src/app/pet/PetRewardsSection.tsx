import { playRewardSample } from '@/lib/actionRewards'
import { analytics } from '@/lib/analytics'
import { previewRewardSounds } from '@/lib/audio'
import i18n from '@/lib/locales'
import {
  knownRewardSoundSet,
  rewardSoundSets,
  usePreferences,
  type RewardSoundSet,
} from '@/stores/preferences'
import type { GamePalette } from '@/features/pet/art/gameUi'
import {
  GameChoiceRow,
  GameRow,
  GameSection,
  GameSwitchRow,
} from '@/features/pet/components/GameRows'

const SOUND_LABELS: Record<RewardSoundSet, () => string> = {
  signature: () => i18n.t('rewardSounds_signature'),
  classic: () => i18n.t('rewardSounds_classic'),
  click: () => i18n.t('rewardSounds_click'),
  soft: () => i18n.t('rewardSounds_soft'),
  wood: () => i18n.t('rewardSounds_wood'),
  analog: () => i18n.t('rewardSounds_analog'),
  thock: () => i18n.t('rewardSounds_thock'),
  off: () => i18n.t('rewardSounds_off'),
}

export default function PetRewardsSection({
  palette,
}: {
  palette: GamePalette
}) {
  const rewardAnimations = usePreferences((state) => state.rewardAnimations)
  const rewardSounds = usePreferences((state) =>
    knownRewardSoundSet(state.rewardSounds)
  )
  const audioEnabled = usePreferences((state) => state.audioEnabled)
  const set = usePreferences((state) => state.set)

  return (
    <GameSection
      title={i18n.t('rewards')}
      footer={
        rewardAnimations && !audioEnabled
          ? i18n.t('rewardSounds_audioOff')
          : undefined
      }
      palette={palette}
    >
      <GameSwitchRow
        label={i18n.t('rewardAnimations')}
        info={i18n.t('rewardAnimations_description')}
        value={rewardAnimations}
        onValueChange={(enabled) => {
          set({ rewardAnimations: enabled })
          analytics.capture('reward_animations_changed', { enabled })
        }}
        palette={palette}
      />
      {rewardAnimations && (
        <GameChoiceRow
          label={i18n.t('rewardSounds')}
          choices={rewardSoundSets.map((key) => ({
            key,
            label: SOUND_LABELS[key](),
          }))}
          value={rewardSounds}
          columns={2}
          onChange={(sounds) => {
            set({ rewardSounds: sounds })
            analytics.capture('reward_sounds_changed', { sounds })
            previewRewardSounds(sounds)
          }}
          palette={palette}
        />
      )}
      {rewardAnimations && (
        <GameRow
          label={i18n.t('rewardSample')}
          icon='play'
          onPress={() => void playRewardSample()}
          palette={palette}
          testID='pet-reward-sample'
        />
      )}
    </GameSection>
  )
}
