import { Check as CheckIcon, Play as PlayIcon } from 'lucide-react-native'
import {
  GroupedList,
  GroupedListRow,
  GroupedListSection,
  GroupedListSwitchRow,
} from '@/components/ui/GroupedList'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
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

/** What each set sounds like, under its name. */
const SOUND_DESCRIPTIONS: Record<RewardSoundSet, (() => string) | undefined> = {
  signature: () => i18n.t('rewardSounds_signature_description'),
  classic: () => i18n.t('rewardSounds_classic_description'),
  click: () => i18n.t('rewardSounds_click_description'),
  soft: () => i18n.t('rewardSounds_soft_description'),
  wood: () => i18n.t('rewardSounds_wood_description'),
  analog: () => i18n.t('rewardSounds_analog_description'),
  thock: () => i18n.t('rewardSounds_thock_description'),
  off: undefined,
}

/**
 * Settings → Rewards: whether what the User earns plays as the reward stack,
 * the sounds it plays (each one previews when picked), and a sample.
 */
export default function PreferencesRewardsScreen() {
  const theme = useTheme()
  const rewardAnimations = usePreferences((state) => state.rewardAnimations)
  const rewardSounds = usePreferences((state) =>
    knownRewardSoundSet(state.rewardSounds)
  )
  const audioEnabled = usePreferences((state) => state.audioEnabled)
  const set = usePreferences((state) => state.set)

  const chooseSounds = (sounds: RewardSoundSet) => {
    set({ rewardSounds: sounds })
    analytics.capture('reward_sounds_changed', { sounds })
    previewRewardSounds(sounds)
  }

  return (
    <GroupedList>
      <GroupedListSection footer={i18n.t('rewardAnimations_description')}>
        <GroupedListSwitchRow
          label={i18n.t('rewardAnimations')}
          value={rewardAnimations}
          onValueChange={(enabled) => {
            set({ rewardAnimations: enabled })
            analytics.capture('reward_animations_changed', { enabled })
          }}
        />
      </GroupedListSection>
      {rewardAnimations && (
        <GroupedListSection
          title={i18n.t('rewardSounds')}
          footer={audioEnabled ? undefined : i18n.t('rewardSounds_audioOff')}
        >
          {rewardSoundSets.map((sounds) => (
            <GroupedListRow
              key={sounds}
              label={SOUND_LABELS[sounds]()}
              sublabel={SOUND_DESCRIPTIONS[sounds]?.()}
              checked={rewardSounds === sounds}
              accessory='none'
              trailing={
                rewardSounds === sounds ? (
                  <LucideIcon
                    icon={CheckIcon}
                    size={18}
                    color={theme.colors.accent}
                  />
                ) : undefined
              }
              onPress={() => chooseSounds(sounds)}
              testID={`reward-sounds-${sounds}`}
            />
          ))}
        </GroupedListSection>
      )}
      {rewardAnimations && (
        <GroupedListSection>
          <GroupedListRow
            icon={PlayIcon}
            label={i18n.t('rewardSample')}
            accessory='none'
            onPress={() => void playRewardSample()}
            testID='reward-sample'
          />
        </GroupedListSection>
      )}
    </GroupedList>
  )
}
