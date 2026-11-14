import {
  GroupedListReorderSection,
  GroupedListSwitchRow,
} from '@/components/ui/GroupedList'
import { moveItem } from '@/lib/reorder'
import i18n from '@/lib/locales'
import { getEffectiveScheduleScreenOrder } from '@/lib/scheduleScreenPreferences'
import { usePreferences } from '@/stores/preferences'

const ScheduleScreenPreferencesSection = () => {
  const preferences = usePreferences()
  const order = getEffectiveScheduleScreenOrder(
    preferences.scheduleScreenElementsOrder
  )

  return (
    <GroupedListReorderSection
      title={i18n.t('sectionsVisibility')}
      data={order}
      keyExtractor={(key) => key}
      onMove={(from, to) =>
        preferences.set({
          scheduleScreenElementsOrder: moveItem(order, from, to),
        })
      }
    >
      {(key) => (
        <GroupedListSwitchRow
          label={i18n.t('assistant.label')}
          value={preferences.scheduleScreenElements[key]}
          onValueChange={(value) =>
            preferences.set((state) => ({
              scheduleScreenElements: {
                ...state.scheduleScreenElements,
                [key]: value,
              },
            }))
          }
        />
      )}
    </GroupedListReorderSection>
  )
}

export default ScheduleScreenPreferencesSection
