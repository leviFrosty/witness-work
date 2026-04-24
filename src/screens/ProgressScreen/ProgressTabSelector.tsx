import { StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'

import useTheme from '../../contexts/theme'
import i18n from '../../lib/locales'
import Button from '../../components/Button'
import Text from '../../components/MyText'

export type ProgressTab = 'month' | 'year' | 'allTime'

interface ProgressTabSelectorProps {
  activeTab: ProgressTab
  onChange: (tab: ProgressTab) => void
  hideYearTab: boolean
}

/**
 * Segmented pill control used at the top of `ProgressScreen`. Liquid-glass
 * style: pill container with a BlurView backdrop, active segment uses the
 * accent translucent fill + bold text, inactive uses subdued color.
 *
 * When `hideYearTab` is true (publisher type with no year goal) only the Month
 * and All-time buttons render.
 */
const ProgressTabSelector = ({
  activeTab,
  onChange,
  hideYearTab,
}: ProgressTabSelectorProps) => {
  const theme = useTheme()
  const isDark = theme.colors.background === '#121212'

  const tabs: { key: ProgressTab; label: string }[] = [
    { key: 'month', label: i18n.t('month') },
    ...(hideYearTab
      ? []
      : [{ key: 'year' as ProgressTab, label: i18n.t('year') }]),
    { key: 'allTime', label: i18n.t('allTime') },
  ]

  return (
    <View
      style={{
        marginHorizontal: 15,
        height: 40,
        borderRadius: 999,
        borderCurve: 'continuous',
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'stretch',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
      }}
    >
      <BlurView
        tint={isDark ? 'dark' : 'light'}
        intensity={40}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents='none'
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.colors.card,
            opacity: 0.45,
          },
        ]}
      />
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab
        return (
          <Button
            key={tab.key}
            noTransform
            onPress={() => onChange(tab.key)}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              margin: 4,
              borderRadius: 999,
              backgroundColor: isActive
                ? theme.colors.accentTranslucent
                : 'transparent',
            }}
          >
            <Text
              style={{
                color: isActive ? theme.colors.accent : theme.colors.textAlt,
                fontFamily: isActive
                  ? theme.fonts.semiBold
                  : theme.fonts.medium,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {tab.label}
            </Text>
          </Button>
        )
      })}
    </View>
  )
}

export default ProgressTabSelector
