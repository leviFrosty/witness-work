import { ChevronRight as ChevronRightIcon } from 'lucide-react-native'
import { ActionSheetIOS, Alert, Platform } from 'react-native'

import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
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
 * when both are editable, a tap asks which to change.
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

  const open = (target: EditTarget, via: 'menu' | 'direct') => {
    analytics.capture('month_card_edit_opened', { target, via })
    if (target === 'status') onEditStatus()
    else onEditGoal()
  }

  const onPress = () => {
    if (!statusLabel) return open('goal', 'direct')
    if (!hasGoal) return open('status', 'direct')
    const dismissed = () => analytics.capture('month_card_edit_menu_dismissed')
    if (Platform.OS !== 'ios') {
      // ActionSheetIOS is iOS-only; a three-button alert covers the same menu.
      Alert.alert(
        label,
        undefined,
        [
          { text: i18n.t('cancel'), style: 'cancel', onPress: dismissed },
          {
            text: i18n.t('monthStatus.changeStatus'),
            onPress: () => open('status', 'menu'),
          },
          {
            text: i18n.t('monthStatus.changeGoal'),
            onPress: () => open('goal', 'menu'),
          },
        ],
        { cancelable: true, onDismiss: dismissed }
      )
      return
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          i18n.t('monthStatus.changeStatus'),
          i18n.t('monthStatus.changeGoal'),
          i18n.t('cancel'),
        ],
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) open('status', 'menu')
        else if (index === 1) open('goal', 'menu')
        else dismissed()
      }
    )
  }

  return (
    <Button
      noTransform
      accessibilityRole='button'
      accessibilityLabel={i18n.t('monthStatus.editAccessibility', {
        summary: label,
      })}
      onPress={onPress}
      hitSlop={8}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flexShrink: 1,
      }}
    >
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
    </Button>
  )
}

export default MonthStatusGoalButton
