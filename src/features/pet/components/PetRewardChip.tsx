import { PixelRatio } from 'react-native'
import Animated, { ZoomIn } from 'react-native-reanimated'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import RewardTally from '@/components/reward-stack/RewardTally'
import type { RewardProbe } from '@/lib/actionRewards'
import i18n, { type TranslationKey } from '@/lib/locales'
import { getStreakKind } from '@/lib/publisherCapabilities'
import { calendarMonthOf, roleForMonth } from '@/lib/roleHistory'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import { startReward, type RewardLine } from '@/stores/rewardStack'
import { COIN_ICON_PX } from '@/features/pet/art/gameUi'
import { CoinIcon } from '@/features/pet/components/GamePixels'
import {
  COINS_PER_DAY,
  COINS_PER_MILESTONE,
  COINS_PER_PLAN_KEPT,
  walletGain,
} from '@/features/pet/lib/currency'
import { seenPetKey } from '@/features/pet/lib/reveal'
import { earnedCounts, rewardLines } from '@/features/pet/lib/rewardLines'
import { gainedText, signedAmountText } from '@/features/pet/lib/roomLabels'
import { petEarningsNow } from '@/features/pet/lib/walletNow'
import { crispScale } from '@/features/pet/render/crispScale'
import { usePetSeen } from '@/features/pet/stores/petSeen'

/** About 2 pt a pixel: a 10-pixel icon beside the toast's 15 pt text. */
const ICON_PT = 2

/**
 * What a save earned, after the confirming toast's text, when the reward stack
 * doesn't play: "+2" beside a coin. It pops in once the toast has.
 */
export default function PetRewardChip({ gain }: { gain: number }) {
  const theme = useTheme()
  const scale = crispScale(ICON_PT, 1, PixelRatio.get())
  return (
    <Animated.View
      entering={ZoomIn.delay(250).springify().damping(11)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingStart: 7,
        paddingEnd: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: `${theme.colors.textInverse}1F`,
      }}
    >
      <CoinIcon scale={scale} />
      <Text
        style={{
          color: theme.colors.textInverse,
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.bold,
          fontVariant: ['tabular-nums'],
        }}
      >
        {signedAmountText(gain)}
      </Text>
    </Animated.View>
  )
}

/**
 * The coin about `size` points square, for the reward stack: the large icon
 * from 20 points, kept crisp.
 */
export function rewardIcon(size: number) {
  const iconSize = size >= 20 ? 'large' : 'small'
  return (
    <CoinIcon
      size={iconSize}
      scale={crispScale(size, COIN_ICON_PX[iconSize], PixelRatio.get())}
    />
  )
}

/** What the Service Streak counts now, which names its milestones. */
const streakKindNow = () => {
  const { role, roleHistory } = usePreferences.getState()
  return getStreakKind(
    roleForMonth(roleHistory, role, calendarMonthOf(new Date()))
  )
}

/**
 * Measures what a save of the User's earns the pet (`measureReward`), plays it
 * as the reward stack where they are, line by line ("+1 Time added", "+1
 * Planned day kept"), and returns the toast's tally that its total drops into.
 * With the stack off, the toast shows the "+N" chip instead. Either way the
 * gain is seen, so the pet's card doesn't play it again. Nothing without a pet
 * or a gain.
 */
export const petRewardProbe: RewardProbe = (action) => {
  const before = petEarningsNow()
  return () => {
    const after = petEarningsNow()
    const pet = usePet.getState().pet
    if (!before || !after || !pet) return null
    const gain = walletGain(before.wallet, after.wallet)
    const label = gainedText(gain)
    if (!label) return null
    usePetSeen
      .getState()
      .markEarnedSeen(seenPetKey(pet), after.wallet, earnedCounts(after.earned))
    const count = { from: before.wallet, to: after.wallet }
    const runId = startReward({
      slot: 'toast',
      lines: rewardLines(
        earnedCounts(before.earned),
        after.earned,
        action,
        streakKindNow()
      ),
      count,
      icon: rewardIcon,
      announcement: label,
    })
    return {
      label,
      render: () =>
        runId === null ? (
          <PetRewardChip gain={gain} />
        ) : (
          <RewardTally runId={runId} count={count} icon={rewardIcon} />
        ),
    }
  }
}

/**
 * A sample reward for Settings → Rewards: a planned day kept that reached a
 * streak milestone, counting into the pet's wallet as it is. Nothing is
 * earned.
 */
export function playPetRewardSample(): boolean {
  const wallet = petEarningsNow()?.wallet ?? 0
  const lines: RewardLine[] = [
    {
      amount: COINS_PER_DAY,
      label: i18n.t('pet.reward.timeAdded'),
      tone: 'base',
    },
    {
      amount: COINS_PER_PLAN_KEPT,
      label: i18n.t('pet.reward.plansKept' as TranslationKey, { count: 1 }),
      tone: 'bonus',
    },
    {
      amount: COINS_PER_MILESTONE,
      label: i18n.t('pet.reward.milestone', { count: 10 }),
      tone: 'milestone',
    },
  ]
  const gain = lines.reduce((sum, line) => sum + line.amount, 0)
  return (
    startReward({
      slot: 'toast',
      lines,
      count: { from: wallet, to: wallet + gain },
      icon: rewardIcon,
      announcement: gainedText(gain) ?? '',
    }) !== null
  )
}
