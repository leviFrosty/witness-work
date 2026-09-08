import { ArrowDown, ArrowUp } from 'lucide-react-native'
import { Switch, View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { rowPaddingVertical } from '@/constants/Inputs'
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

  const setVisibility = (key: ScheduleScreenElementKey, value: boolean) => {
    preferences.set((state) => ({
      scheduleScreenElements: { ...state.scheduleScreenElements, [key]: value },
    }))
  }

  return (
    <Section>
      <View
        style={{
          paddingRight: 20,
          paddingVertical: rowPaddingVertical,
          gap: 15,
        }}
      >
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('sectionsVisibility')}
        </Text>
        <View style={{ paddingLeft: 20, gap: 12 }}>
          {order.map((key, index) => (
            <XView
              key={key}
              style={{ justifyContent: 'space-between', gap: 6 }}
            >
              <XView style={{ gap: 8 }}>
                <IconButton
                  icon={ArrowUp}
                  onPress={index === 0 ? undefined : () => move(index, -1)}
                  color={
                    index === 0 ? theme.colors.border : theme.colors.textAlt
                  }
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 0 }}
                />
                <IconButton
                  icon={ArrowDown}
                  onPress={
                    index === order.length - 1
                      ? undefined
                      : () => move(index, 1)
                  }
                  color={
                    index === order.length - 1
                      ? theme.colors.border
                      : theme.colors.textAlt
                  }
                  hitSlop={{ top: 10, bottom: 10, left: 0, right: 10 }}
                />
              </XView>
              <Text style={{ flex: 1, marginLeft: 8 }}>
                {i18n.t('assistant.label')}
              </Text>
              <Switch
                accessibilityLabel={i18n.t('assistant.label')}
                value={preferences.scheduleScreenElements.assistant}
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
