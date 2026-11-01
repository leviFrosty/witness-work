import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { View } from 'react-native'

import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import PullDownMenu from '@/components/ui/PullDownMenu'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'

import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'

type EditTarget = 'status' | 'goal'

type Props = {
  statusLabel: string | null

  isStatusDifferent: boolean

  goalHours: number | null
  isGoalOverridden: boolean
  onEditStatus: () => void
  onEditGoal: () => void
}

const MonthStatusGoalButton = ({
  statusLabel,
  isStatusDifferent,
  goalHours,
  isGoalOverridden,
  onEditStatus,
  onEditGoal,
}: Props) => {
  const theme = useTheme()

  const largeText = useAccessibilityTextSize()
  const goalDisplay = useFormattedMinutes(Math.round((goalHours ?? 0) * 60))
  const hasGoal = goalHours !== null && goalHours > 0

  if (!statusLabel && !hasGoal) return null

  const label =
    statusLabel && hasGoal
      ? i18n.t('monthStatus.withGoal', {
          status: statusLabel,
          goal: goalDisplay.formatted,
        })
      : (statusLabel ?? i18n.t('goalLabel', { value: goalDisplay.formatted }))
  const highlighted = isStatusDifferent || isGoalOverridden
  const color = highlighted ? theme.colors.accent : theme.colors.textAlt

  const open = (target: EditTarget) => {
    if (target === 'status') onEditStatus()
    else onEditGoal()
  }

  const content = (
    <>
      <Text
        numberOfLines={largeText ? undefined : 2}
        style={{
          flexShrink: 1,
          color,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {label}
      </Text>
      <LucideIcon icon={ChevronForwardIcon} size={12} style={{ color }} />
    </>
  )
  const accessibilityLabel = i18n.t('monthStatus.editAccessibility', {
    summary: label,
  })

  if (statusLabel && hasGoal) {
    return (
      <PullDownMenu
        accessibilityLabel={accessibilityLabel}
        fill
        style={{ flexShrink: 1 }}
        actions={[
          {
            id: 'change_status',
            title: i18n.t('changeStatusEllipsis'),
            systemImage: 'person.crop.circle',
            onPress: () => open('status'),
          },
          {
            id: 'change_goal',
            title: i18n.t('changeGoalEllipsis'),
            systemImage: 'target',
            onPress: () => open('goal'),
          },
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            flexShrink: 1,
          }}
        >
          {content}
        </View>
      </PullDownMenu>
    )
  }

  return (
    <Button
      noTransform
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel}
      onPress={() => open(statusLabel ? 'status' : 'goal')}
      hitSlop={8}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flexShrink: 1,
      }}
    >
      {content}
    </Button>
  )
}

export default MonthStatusGoalButton
