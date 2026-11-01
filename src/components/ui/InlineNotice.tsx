import { useEffect } from 'react'
import {
  AccessibilityInfo,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  CircleAlert as CircleAlertIcon,
  Info as InfoIcon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export type InlineNoticeTone = 'offline' | 'error' | 'info'

const ICONS: Record<InlineNoticeTone, AppIcon> = {
  offline: WifiOffIcon,
  error: CircleAlertIcon,
  info: InfoIcon,
}

export type InlineNoticeProps = {
  message: string
  tone?: InlineNoticeTone

  onRetry?: () => void

  retrying?: boolean

  retryLabel?: string
  style?: StyleProp<ViewStyle>
}

export default function InlineNotice({
  message,
  tone = 'error',
  onRetry,
  retrying = false,
  retryLabel,
  style,
}: InlineNoticeProps) {
  const theme = useTheme()

  useEffect(() => {
    if (Platform.OS === 'ios')
      AccessibilityInfo.announceForAccessibility(message)
  }, [message])

  return (
    <XView
      accessibilityRole='alert'
      accessibilityLiveRegion='polite'
      style={[
        {
          gap: 10,
          alignItems: 'center',
          minHeight: 44,
          paddingHorizontal: 15,
          paddingVertical: 8,
          borderRadius: theme.numbers.borderRadiusLg,
          backgroundColor: theme.colors.backgroundLighter,
        },
        style,
      ]}
    >
      <LucideIcon
        icon={ICONS[tone]}
        size={theme.fontSize('md')}
        color={tone === 'error' ? theme.colors.error : theme.colors.textAlt}
      />
      <Text
        style={{
          flex: 1,
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {message}
      </Text>
      {onRetry && (
        <Button
          noTransform
          onPress={onRetry}
          loading={retrying}
          loadingColor={theme.colors.textAlt}
          accessibilityRole='button'
        >
          <Text
            style={{
              color: theme.colors.accent,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {retryLabel ?? i18n.t('common_tryAgain')}
          </Text>
        </Button>
      )}
    </XView>
  )
}
