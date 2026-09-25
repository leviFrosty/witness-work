import { PropsWithChildren, useContext } from 'react'
import Button, { ButtonProps } from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import {
  MAP_IMAGERY_GLASS_TINT,
  MapImageryContext,
} from '@/features/map/lib/mapImageryTheme'

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
  const overImagery = useContext(MapImageryContext)

  return (
    <Button
      noTransform
      accessible={!!onPress}
      onPress={onPress}
      onAccessibilityEscape={onAccessibilityEscape}
      variant='glass'
      glassTint={overImagery ? MAP_IMAGERY_GLASS_TINT : undefined}
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
