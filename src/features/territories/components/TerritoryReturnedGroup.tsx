import { type PropsWithChildren, useState } from 'react'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Collapse from '@/components/ui/Collapse'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { isRtlLayout } from '@/lib/direction'
import i18n from '@/lib/locales'

export default function TerritoryReturnedGroup({
  count,
  children,
}: PropsWithChildren<{ count: number }>) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <View>
      <Button
        onPress={() => setOpen(!open)}
        accessibilityRole='button'
        accessibilityState={{ expanded: open }}
        accessibilityLabel={i18n.t(
          open ? 'territories.finished_hide' : 'territories.finished_show'
        )}
        testID='territories-returned-toggle'
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 48,
          paddingHorizontal: 5,
          gap: 10,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('territories.finished')}
        </Text>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
            fontVariant: ['tabular-nums'],
          }}
        >
          {count}
        </Text>
        <View
          style={{
            transform: [
              { rotate: open ? (isRtlLayout() ? '-90deg' : '90deg') : '0deg' },
            ],
          }}
        >
          <LucideIcon
            icon={ChevronForwardIcon}
            size={18}
            color={theme.colors.textAlt}
          />
        </View>
      </Button>
      <Collapse collapsed={!open}>
        <View style={{ paddingTop: 4 }}>{children}</View>
      </Collapse>
    </View>
  )
}
