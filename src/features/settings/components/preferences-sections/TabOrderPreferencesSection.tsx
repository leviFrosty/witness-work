import { View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import ReorderControls from '@/features/settings/components/shared/ReorderControls'
import { reorderMenuActions } from '@/features/settings/components/shared/reorderMenuActions'
import ContextMenu from '@/components/ui/ContextMenu'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { getEffectiveTabOrder, moveVisibleTab } from '@/lib/tabOrderPreferences'
import { usePreferences } from '@/stores/preferences'

const TabOrderPreferencesSection = () => {
  const { tabOrder, set } = usePreferences()
  const { showsYearTabs } = usePublisher()
  const theme = useTheme()
  const order = getEffectiveTabOrder(tabOrder)
  // Progress keeps its saved position while hidden so switching roles
  // restores it.
  const visible = order.filter((key) => key !== 'Progress' || showsYearTabs)

  const moveTo = (index: number, target: number, source: 'arrows' | 'menu') => {
    const next = moveVisibleTab(order, visible, index, target)
    if (next === order) return
    analytics.capture('tab_order_changed', {
      order: next.join(','),
      source,
    })
    set({ tabOrder: next })
  }

  return (
    <Section>
      <View style={{ paddingHorizontal: 12 }}>
        {visible.map((key, index) => {
          const isFirst = index === 0
          const isLast = index === visible.length - 1
          return (
            <XView
              key={key}
              style={{
                minHeight: 76,
                paddingVertical: 16,
                gap: 6,
                borderBottomWidth: isLast ? 0 : 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <ReorderControls
                onMoveUp={
                  isFirst ? undefined : () => moveTo(index, index - 1, 'arrows')
                }
                onMoveDown={
                  isLast ? undefined : () => moveTo(index, index + 1, 'arrows')
                }
              />
              {/* Long-press the label; the arrows stay outside the menu's
                  trigger. Tabs can't be hidden, so the menu only moves. */}
              <ContextMenu
                style={{ flex: 1, minWidth: 0 }}
                actions={reorderMenuActions({
                  index,
                  count: visible.length,
                  moveTo: (target) => moveTo(index, target, 'menu'),
                })}
              >
                <Text style={{ paddingVertical: 8 }}>{i18n.t(key)}</Text>
              </ContextMenu>
            </XView>
          )
        })}
      </View>
    </Section>
  )
}

export default TabOrderPreferencesSection
