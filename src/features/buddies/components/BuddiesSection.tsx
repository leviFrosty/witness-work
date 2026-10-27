import { PropsWithChildren } from 'react'
import { View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

/**
 * A group of Buddies rows, titled unless a sheet's header already names it,
 * with an optional footnote.
 */
export default function BuddiesSection({
  title,
  footer,
  children,
}: PropsWithChildren<{ title?: string; footer?: string }>) {
  const theme = useTheme()
  const note = {
    color: theme.colors.textAlt,
    fontSize: theme.fontSize('sm'),
    paddingHorizontal: 15,
  }
  return (
    <View style={{ gap: 8 }}>
      {title ? (
        <Text
          style={{
            ...note,
            fontFamily: theme.fonts.semiBold,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Text>
      ) : null}
      <Section style={{ paddingVertical: 0 }}>{children}</Section>
      {footer ? <Text style={note}>{footer}</Text> : null}
    </View>
  )
}
