import { View } from 'react-native'
import Switch from '@/components/ui/Switch'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import ReorderControls from '@/features/settings/components/shared/ReorderControls'
import {
  moveItem,
  reorderMenuActions,
} from '@/features/settings/components/shared/reorderMenuActions'
import ContextMenu from '@/components/ui/ContextMenu'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  getEffectiveScheduleScreenOrder,
  type ScheduleScreenElementKey,
} from '@/lib/scheduleScreenPreferences'
import { usePreferences } from '@/stores/preferences'

const ScheduleScreenPreferencesSection = () => {
  const preferences = usePreferences()
  const theme = useTheme()
  const order = getEffectiveScheduleScreenOrder(
    preferences.scheduleScreenElementsOrder
  )

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    preferences.set({ scheduleScreenElementsOrder: next })
  }

  const moveTo = (index: number, target: number) =>
    preferences.set({
      scheduleScreenElementsOrder: moveItem(order, index, target),
    })

  const setVisibility = (key: ScheduleScreenElementKey, value: boolean) => {
    preferences.set((state) => ({
      scheduleScreenElements: { ...state.scheduleScreenElements, [key]: value },
    }))
  }

  return (
    <Section>
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 16,
          gap: 0,
        }}
      >
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('sectionsVisibility')}
        </Text>
        <View>
          {order.map((key, index) => (
            <XView
              key={key}
              style={{
                minHeight: 76,
                paddingVertical: 16,
                justifyContent: 'space-between',
                gap: 6,
                borderBottomWidth: index === order.length - 1 ? 0 : 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <ReorderControls
                onMoveUp={index === 0 ? undefined : () => move(index, -1)}
                onMoveDown={
                  index === order.length - 1 ? undefined : () => move(index, 1)
                }
              />
              {/* Long-press the label; the arrows and switch stay outside
                  the menu's trigger. */}
              <ContextMenu
                style={{ flex: 1, minWidth: 0 }}
                analyticsSurface='schedule_screen_preferences_row'
                actions={reorderMenuActions({
                  index,
                  count: order.length,
                  moveTo: (target) => moveTo(index, target),
                  visible: preferences.scheduleScreenElements[key],
                  setVisible: (value) => setVisibility(key, value),
                })}
              >
                <Text style={{ paddingVertical: 8 }}>
                  {i18n.t('assistant.label')}
                </Text>
              </ContextMenu>
              <Switch
                accessibilityLabel={i18n.t('assistant.label')}
                value={preferences.scheduleScreenElements[key]}
                onValueChange={(value) => setVisibility(key, value)}
              />
            </XView>
          ))}
        </View>
      </View>
    </Section>
  )
}

export default ScheduleScreenPreferencesSection
