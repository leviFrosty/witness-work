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
  /** Shows a Try Again action. */
  onRetry?: () => void
  /** A retry is running: the action shows a spinner and can't be pressed. */
  retrying?: boolean
  /** Defaults to "Try Again". */
  retryLabel?: string
  style?: StyleProp<ViewStyle>
}

/**
 * A slim line saying why something couldn't load, beside content that still
 * shows, with an optional Try Again. Screen readers announce it when it
 * appears. For a whole screen that failed, use `Empty` with a Try Again action
 * instead.
 */
export default function InlineNotice({
  message,
  tone = 'error',
  onRetry,
  retrying = false,
  retryLabel,
  style,
}: InlineNoticeProps) {
  const theme = useTheme()

  // Android announces through `accessibilityLiveRegion`.
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
