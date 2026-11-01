import { useEffect, useRef } from 'react'
import { useNavigation } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import CircularProgress from '@/components/ui/CircularProgress'
import PointerTooltip from '@/components/ui/PointerTooltip'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import { useScribeUsage } from '@/features/scribe'
import { fullestWindow } from '@/features/scribe/components/scribeCopy'

const ScribeUsageMeter = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { usage } = useScribeUsage()
  const fullest = fullestWindow(usage)

  const ringOnly = useAccessibilityTextSize()
  const reported = useRef(false)

  useEffect(() => {
    if (!usage || reported.current) return
    reported.current = true
    analytics.capture('scribe_usage_viewed', {
      surface: 'conversation',
      plan: usage.plan,
      limited: usage.limited,
    })
  }, [usage])

  if (!usage || !fullest) return null
  const percent = fullest.percentUsed
  const color =
    percent >= 100
      ? theme.colors.error
      : percent >= 80
        ? theme.colors.warn
        : theme.colors.accent
  const label = i18n.t('scribe_usagePercent', { percent })

  return (
    <PointerTooltip label={i18n.t('scribe_usageTitle')} effect='none'>
      <Button
        onPress={() => navigation.navigate('ScribeUsage')}
        accessibilityRole='button'
        accessibilityLabel={`${i18n.t('scribe_usageTitle')}, ${label}`}
        pointerEffect='highlight'
        style={{
          minWidth: MIN_TOUCH_TARGET,
          height: MIN_TOUCH_TARGET,
          borderRadius: 999,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        <CircularProgress
          progress={percent / 100}
          size={16}
          strokeWidth={2.5}
          color={color}
          trackColor={theme.colors.border}
        />
        {ringOnly ? null : (
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              fontVariant: ['tabular-nums'],
            }}
          >
            {`${percent}%`}
          </Text>
        )}
      </Button>
    </PointerTooltip>
  )
}

export default ScribeUsageMeter
