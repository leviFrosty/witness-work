import { PropsWithChildren } from 'react'
import Button, { ButtonProps } from '@/components/ui/Button'
import useTheme from '@/contexts/theme'

type Props = PropsWithChildren<
  Pick<ButtonProps, 'onPress' | 'onAccessibilityEscape'> & { fill?: boolean }
>

export default function MapCard({
  children,
  fill = true,
  onPress,
  onAccessibilityEscape,
}: Props) {
  const theme = useTheme()

  return (
    <Button
      noTransform
      accessible={!!onPress}
      onPress={onPress}
      onAccessibilityEscape={onAccessibilityEscape}
      variant='glass'
      style={{
        borderRadius: theme.numbers.borderRadiusLg,
        borderCurve: 'continuous',
        borderWidth: 0,
        flexDirection: 'column',
        alignItems: 'stretch',
        padding: 12,
        gap: 4,
        flex: fill ? 1 : undefined,
      }}
    >
      {children}
    </Button>
  )
}
