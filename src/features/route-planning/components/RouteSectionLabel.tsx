import type { ReactNode } from 'react'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

/** The small uppercase heading above each part of the route screen. */
export default function RouteSectionLabel({
  children,
}: {
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <Text
      style={{
        color: theme.colors.textAlt,
        textTransform: 'uppercase',
        fontSize: theme.fontSize('sm'),
        fontFamily: theme.fonts.semiBold,
        letterSpacing: 0.5,
      }}
    >
      {children}
    </Text>
  )
}
