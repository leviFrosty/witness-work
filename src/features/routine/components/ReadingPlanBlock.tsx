import { View } from 'react-native'
import Button from '@/components/ui/Button'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { portionLabel } from '@/lib/routine/labels'
import { planPortion } from '@/lib/routine/readingPlans'
import type { RoutineEntry } from '@/types/routine'
import type { ActivePlan } from '@/features/routine/hooks/useRoutineToday'
import { readToday } from '@/features/routine/lib/itemDetail'

function ActionButton({
  label,
  onPress,
  primary,
  testID,
}: {
  label: string
  onPress: () => void
  primary?: boolean
  testID?: string
}) {
  const theme = useTheme()
  return (
    <Button
      accessibilityRole='button'
      onPress={onPress}
      testID={testID}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.numbers.borderRadiusMd,
        ...(primary
          ? { backgroundColor: theme.colors.accent }
          : { borderWidth: 1, borderColor: theme.colors.border }),
      }}
    >
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          color: primary ? theme.colors.textInverse : theme.colors.text,
        }}
      >
        {label}
      </Text>
    </Button>
  )
}

export default function ReadingPlanBlock({
  plan,
  entries,
  today,
  onRead,
  onChoosePlan,
}: {
  plan: ActivePlan | null
  entries: readonly RoutineEntry[]
  today: string
  onRead: () => void
  onChoosePlan: () => void
}) {
  const theme = useTheme()
  if (!plan)
    return (
      <ActionButton
        label={i18n.t('routine.screen.startPlan')}
        onPress={onChoosePlan}
        testID='routine-start-plan'
      />
    )
  const { run, progress } = plan
  const readIndex = readToday(run, entries, today)
  const doneToday = readIndex !== null
  const day = Math.min(progress.total, progress.read + (doneToday ? 0 : 1))
  const todays = doneToday ? planPortion(run, readIndex) : progress.next
  return (
    <View style={{ gap: 12 }} testID='routine-plan'>
      <View style={{ gap: 6 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('routine.screen.planTitle')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('routine.screen.planDay', { day, total: progress.total })}
          </Text>
        </View>
        <SimpleProgressBar
          percentage={progress.total ? progress.read / progress.total : 0}
          color={theme.colors.accent}
          height={8}
          animated={false}
        />
      </View>
      {todays ? (
        <View style={{ gap: 2 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('routine.screen.todaysReading')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {portionLabel(todays)}
          </Text>
          {doneToday && progress.next ? (
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('routine.screen.nextUp', {
                portion: portionLabel(progress.next),
              })}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {!doneToday && progress.next ? (
          <ActionButton
            primary
            label={i18n.t('routine.screen.markRead')}
            onPress={onRead}
            testID='routine-mark-read'
          />
        ) : null}
        {doneToday && progress.next ? (
          <ActionButton
            label={i18n.t('routine.screen.readNext')}
            onPress={onRead}
            testID='routine-read-next'
          />
        ) : null}
        <ActionButton
          label={i18n.t('routine.screen.changePlan')}
          onPress={onChoosePlan}
          testID='routine-change-plan'
        />
      </View>
    </View>
  )
}
