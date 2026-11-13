import type { PropsWithChildren, ReactNode } from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { tracking } from '@/lib/tracking'

export default function SortFilterSection({
  title,
  action,
  children,
}: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  const theme = useTheme()
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            textTransform: 'uppercase',
            letterSpacing: tracking(0.5),
          }}
        >
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  )
}
