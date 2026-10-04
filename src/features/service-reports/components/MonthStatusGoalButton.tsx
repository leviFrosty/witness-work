import { ChevronRight as ChevronRightIcon } from 'lucide-react-native'
import { View } from 'react-native'

import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import PullDownMenu from '@/components/ui/PullDownMenu'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'

type EditTarget = 'status' | 'goal'

type Props = {
  /** Short status name; null hides status (e.g. future months). */
  statusLabel: string | null
  /** The month's status differs from the User's standing role. */
  isStatusDifferent: boolean
  /** Null hides the goal (no Monthly Goal for this role). */
  goalHours: number | null
  isGoalOverridden: boolean
  onEditStatus: () => void
  onEditGoal: () => void
}

/**
 * One quiet line — "Auxiliary Pioneer · 30 Hrs goal ›" — replacing separate
 * status and goal chips. The goal follows the status, so they read as one fact;
 * when both are editable, a tap opens a pull-down menu asking which to change.
 */
const MonthStatusGoalButton = ({
  statusLabel,
  isStatusDifferent,
  goalHours,
  isGoalOverridden,
  onEditStatus,
  onEditGoal,
}: Props) => {
  const theme = useTheme()
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
        numberOfLines={1}
        style={{
          flexShrink: 1,
          color,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {label}
      </Text>
      <LucideIcon icon={ChevronRightIcon} size={12} style={{ color }} />
    </>
  )
  const accessibilityLabel = i18n.t('monthStatus.editAccessibility', {
    summary: label,
  })

  // Both editable: a native pull-down asks which to change.
  if (statusLabel && hasGoal) {
    return (
      <PullDownMenu
        accessibilityLabel={accessibilityLabel}
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
