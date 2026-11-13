import type { ReactNode } from 'react'
import { View } from 'react-native'
import Card from '@/components/ui/Card'
import InfoPopover from '@/components/ui/InfoPopover'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export default function InsightsChartCard({
  title,
  info,
  takeaway,
  detail,
  readout,
  children,
  testID,
}: {
  title: string
  info: string
  takeaway: string
  detail: string
  readout: string | null
  children: ReactNode
  testID?: string
}) {
  const theme = useTheme()
  const picked = readout !== null
  return (
    <Card style={{ gap: 14 }} testID={testID}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {title}
          </Text>
          <InfoPopover title={title} description={info} inline />
        </View>
        <Text
          accessibilityRole='header'
          testID={testID && `${testID}-takeaway`}
          style={{
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('lg'),
          }}
        >
          {takeaway}
        </Text>
        <Text
          accessibilityLiveRegion='polite'
          numberOfLines={3}
          testID={testID && `${testID}-readout`}
          style={{
            minHeight: theme.fontSize('sm') * 2.6,
            fontSize: theme.fontSize('sm'),
            color: picked ? theme.colors.text : theme.colors.textAlt,
            fontFamily: picked ? theme.fonts.semiBold : theme.fonts.regular,
          }}
        >
          {readout ?? detail}
        </Text>
      </View>
      {children}
    </Card>
  )
}
