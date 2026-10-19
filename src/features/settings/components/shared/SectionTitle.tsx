import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import InfoPopover from '@/components/ui/InfoPopover'
import useTheme from '@/contexts/theme'
import { inputLayout } from '@/components/ui/inputs/InputLayout'

export const SectionTitle = ({
  text,
  info,
  alignWithIcons = false,
}: {
  text: string
  info?: string
  alignWithIcons?: boolean
}) => {
  const theme = useTheme()

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginStart:
          inputLayout.horizontalPadding +
          (alignWithIcons
            ? inputLayout.iconSize +
              inputLayout.labelGap +
              inputLayout.sectionBorderWidth
            : 0),
        marginEnd: inputLayout.horizontalPadding,
        marginBottom: 8,
      }}
    >
      <Text
        accessibilityRole='header'
        style={{
          flexShrink: 1,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
        }}
      >
        {text}
      </Text>
      {info && <InfoPopover title={text} description={info} inline />}
    </View>
  )
}

export default SectionTitle
