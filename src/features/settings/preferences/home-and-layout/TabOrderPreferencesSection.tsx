import { Platform } from 'react-native'
import {
  GroupedListReorderSection,
  GroupedListRow,
} from '@/components/ui/GroupedList'
import { moveVisible } from '@/lib/reorder'
import usePublisher from '@/hooks/usePublisher'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { getEffectiveTabOrder, isTabAvailable } from '@/lib/tabOrderPreferences'
import { usePreferences } from '@/stores/preferences'

const TabOrderPreferencesSection = () => {
  const { tabOrder, set } = usePreferences()
  const { showsYearTabs } = usePublisher()
  const order = getEffectiveTabOrder(tabOrder)

  const visible = order.filter((key) => isTabAvailable(key, { showsYearTabs }))

  return (
    <GroupedListReorderSection
      data={visible}
      keyExtractor={(key) => key}
      onMove={(from, to) => {
        const next = moveVisible(order, visible, from, to)
        if (next === order) return
        analytics.capture('tab_order_changed', {
          order: next.join(','),
          source: Platform.select({ ios: 'drag', default: 'buttons' }),
        })
        set({ tabOrder: [...next] })
      }}
    >
      {(key) => <GroupedListRow label={i18n.t(key)} accessory='none' />}
    </GroupedListReorderSection>
  )
}

export default TabOrderPreferencesSection
