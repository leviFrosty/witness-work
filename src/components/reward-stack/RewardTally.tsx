import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatNumber } from '@/lib/numbers'
import {
  registerRewardTarget,
  useRewardStack,
  type RewardCount,
  type RewardRun,
} from '@/stores/rewardStack'

export default function RewardTally({
  runId,
  count,
  icon,
}: {
  runId: number
  count: RewardCount
  icon: RewardRun['icon']
}) {
  const theme = useTheme()
  const ref = useRef<View>(null)
  const run = useRewardStack((s) => (s.run?.id === runId ? s.run : null))

  const [latest, setLatest] = useState(count.to)
  useEffect(() => {
    if (run) setLatest(run.count.to)
  }, [run])
  useEffect(() => registerRewardTarget('toast', ref), [])
  const landed = !run || run.phase === 'count'
  return (
    <View
      ref={ref}
      collapsable={false}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingStart: 7,
        paddingEnd: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: `${theme.colors.textInverse}1F`,
        opacity: landed ? 1 : 0.55,
      }}
    >
      <Count value={run ? run.shown : latest} icon={icon(20)} />
    </View>
  )
}

function Count({ value, icon }: { value: number; icon: React.ReactNode }) {
  const theme = useTheme()
  const pop = useSharedValue(1)
  const [first] = useState(value)
  useEffect(() => {
    if (value === first) return
    pop.value = withSequence(
      withTiming(1.4, { duration: 60 }),
      withTiming(1, { duration: 100 })
    )
  }, [value, first, pop])
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }))
  return (
    <Animated.View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 4 }, popStyle]}
    >
      {icon}
      <Text
        style={{
          color: theme.colors.textInverse,
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.bold,
          fontVariant: ['tabular-nums'],
        }}
      >
        {formatNumber(value)}
      </Text>
    </Animated.View>
  )
}
