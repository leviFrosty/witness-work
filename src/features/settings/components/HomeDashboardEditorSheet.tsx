import {
  ArrowDown as ArrowDownIcon,
  ArrowUp as ArrowUpIcon,
} from 'lucide-react-native'
import { ScrollView, Switch, View } from 'react-native'
import { Sheet } from 'tamagui'

import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import i18n from '@/lib/locales'
import {
  DEFAULT_HOME_DASHBOARD_CARD_ORDER,
  DEFAULT_HOME_DASHBOARD_CARD_VISIBILITY,
  getEffectiveHomeDashboardCards,
  type HomeDashboardCardKey,
  MAX_VISIBLE_HOME_DASHBOARD_CARDS,
  usePreferences,
} from '@/stores/preferences'

export interface HomeDashboardEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const labelFor = (key: HomeDashboardCardKey): string =>
  i18n.t(`homeDashboard.editor.cards.${key}`)

/**
 * Lets the User choose up to four secondary Home dashboard cards. Capability
 * gates affect only the rows shown here; preferences for temporarily
 * inapplicable cards remain intact for a future Publisher change.
 */
const HomeDashboardEditorSheet = ({
  open,
  onOpenChange,
}: HomeDashboardEditorSheetProps) => {
  const theme = useTheme()
  const { homeDashboardCardOrder, homeDashboardCardVisibility, set } =
    usePreferences()
  const { entryMode, hasAnnualGoal, monthlyGoalHours } = usePublisher()
  const hasMonthlyGoal = monthlyGoalHours > 0
  const usesHours = entryMode === 'hours'

  const { order, visibility } = getEffectiveHomeDashboardCards(
    homeDashboardCardOrder,
    homeDashboardCardVisibility
  )
  const applicableOrder = order.filter((key) => {
    switch (key) {
      case 'schedulePace':
      case 'plannedTotal':
        return true
      case 'creditTime':
        return usesHours
      case 'projectedMonth':
      case 'remainingToGoal':
        return hasMonthlyGoal
      case 'serviceYearProgress':
        return hasAnnualGoal
    }
  })
  const enabledCount = applicableOrder.filter((key) => visibility[key]).length

  const setVisibility = (key: HomeDashboardCardKey, value: boolean) => {
    if (value && enabledCount >= MAX_VISIBLE_HOME_DASHBOARD_CARDS) return
    set({
      homeDashboardCardVisibility: {
        ...visibility,
        [key]: value,
      },
    })
  }

  const move = (applicableIndex: number, direction: -1 | 1) => {
    const targetIndex = applicableIndex + direction
    if (targetIndex < 0 || targetIndex >= applicableOrder.length) return

    const current = applicableOrder[applicableIndex]
    const target = applicableOrder[targetIndex]
    const next = [...order]
    const currentIndex = next.indexOf(current)
    const globalTargetIndex = next.indexOf(target)
    ;[next[currentIndex], next[globalTargetIndex]] = [
      next[globalTargetIndex],
      next[currentIndex],
    ]
    set({ homeDashboardCardOrder: next })
  }

  const reset = () =>
    set({
      homeDashboardCardOrder: [...DEFAULT_HOME_DASHBOARD_CARD_ORDER],
      homeDashboardCardVisibility: {
        ...DEFAULT_HOME_DASHBOARD_CARD_VISIBILITY,
      },
    })

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      dismissOnSnapToBottom
      modal
      snapPoints={[72]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame backgroundColor={theme.colors.backgroundLighter}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 22,
            paddingBottom: 40,
            gap: 20,
          }}
        >
          <View style={{ gap: 6 }}>
            <Text
              accessibilityRole='header'
              style={{
                color: theme.colors.text,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('xl'),
              }}
            >
              {i18n.t('homeDashboard.editor.title')}
            </Text>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                lineHeight: 20,
              }}
            >
              {i18n.t('homeDashboard.editor.description', {
                count: MAX_VISIBLE_HOME_DASHBOARD_CARDS,
              })}
            </Text>
          </View>

          <View
            style={{
              borderRadius: theme.numbers.borderRadiusMd,
              backgroundColor: theme.colors.background,
              overflow: 'hidden',
            }}
          >
            {applicableOrder.map((key, index) => {
              const isEnabled = visibility[key]
              const enableLimitReached =
                !isEnabled && enabledCount >= MAX_VISIBLE_HOME_DASHBOARD_CARDS
              return (
                <XView
                  key={key}
                  style={{
                    width: '100%',
                    minHeight: 58,
                    paddingHorizontal: 14,
                    gap: 8,
                    alignItems: 'center',
                    borderBottomWidth:
                      index === applicableOrder.length - 1 ? 0 : 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <XView style={{ gap: 4 }}>
                    <IconButton
                      icon={ArrowUpIcon}
                      noTransform
                      onPress={index === 0 ? undefined : () => move(index, -1)}
                      color={
                        index === 0 ? theme.colors.border : theme.colors.textAlt
                      }
                      accessibilityLabel={i18n.t(
                        'homeDashboard.editor.moveUp',
                        { card: labelFor(key) }
                      )}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 0 }}
                    />
                    <IconButton
                      icon={ArrowDownIcon}
                      noTransform
                      onPress={
                        index === applicableOrder.length - 1
                          ? undefined
                          : () => move(index, 1)
                      }
                      color={
                        index === applicableOrder.length - 1
                          ? theme.colors.border
                          : theme.colors.textAlt
                      }
                      accessibilityLabel={i18n.t(
                        'homeDashboard.editor.moveDown',
                        { card: labelFor(key) }
                      )}
                      hitSlop={{ top: 10, bottom: 10, left: 0, right: 10 }}
                    />
                  </XView>
                  <Text style={{ flex: 1 }}>{labelFor(key)}</Text>
                  <View style={{ width: 56, alignItems: 'flex-end' }}>
                    <Switch
                      value={isEnabled}
                      disabled={enableLimitReached}
                      accessibilityLabel={labelFor(key)}
                      accessibilityHint={
                        enableLimitReached
                          ? i18n.t('homeDashboard.editor.limitReached', {
                              count: MAX_VISIBLE_HOME_DASHBOARD_CARDS,
                            })
                          : undefined
                      }
                      onValueChange={(value) => setVisibility(key, value)}
                    />
                  </View>
                </XView>
              )
            })}
          </View>

          <Button
            noTransform
            accessibilityRole='button'
            variant='outline'
            onPress={reset}
            style={{ justifyContent: 'center', paddingVertical: 12 }}
          >
            <Text
              style={{
                color: theme.colors.accent,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('resetToDefaults')}
            </Text>
          </Button>
        </ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}

export default HomeDashboardEditorSheet
