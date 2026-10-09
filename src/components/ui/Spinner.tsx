import { useEffect, useState } from 'react'
import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export type SpinnerProps = Omit<ActivityIndicatorProps, 'animating'> & {
  /** What's loading, read by screen readers. Defaults to "Loading". */
  label?: string
  /**
   * Waits this long before showing, so quick loads don't flash a spinner. The
   * space stays reserved meanwhile, so nothing shifts when it appears.
   */
  delayMs?: number
}

/**
 * The app's loading spinner: an `ActivityIndicator` that screen readers
 * announce. Use it instead of a bare `ActivityIndicator` or Tamagui's
 * `Spinner`, which have no label.
 */
export default function Spinner({
  label,
  delayMs = 0,
  color,
  ...props
}: SpinnerProps) {
  const theme = useTheme()
  const [shown, setShown] = useState(delayMs <= 0)

  useEffect(() => {
    if (delayMs <= 0) return
    const timer = setTimeout(() => setShown(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])

  return (
    <ActivityIndicator
      color={color ?? theme.colors.textAlt}
      {...props}
      animating={shown}
      hidesWhenStopped
      accessible={shown}
      accessibilityRole='progressbar'
      accessibilityLabel={label ?? i18n.t('common_loading')}
      accessibilityState={{ busy: true }}
    />
  )
}
