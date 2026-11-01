import { useEffect, useState } from 'react'
import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export type SpinnerProps = Omit<ActivityIndicatorProps, 'animating'> & {
  label?: string

  delayMs?: number
}

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
