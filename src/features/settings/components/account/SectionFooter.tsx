import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { inputLayout } from '@/components/ui/inputs/InputLayout'

/** A short note under a settings section, lined up with its row labels. */
export default function SectionFooter({ text }: { text: string }) {
  const theme = useTheme()
  return (
    <Text
      style={{
        marginTop: 4,
        marginHorizontal: inputLayout.horizontalPadding,
        fontSize: theme.fontSize('sm'),
        color: theme.colors.textAlt,
      }}
    >
      {text}
    </Text>
  )
}
