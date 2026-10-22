import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import SupporterCtaButton from '@/features/supporter/components/SupporterCtaButton'

interface Props {
  onPress: () => void
}

/** App-tier adapter: Supporter's shimmering button inside Scribe AI's UI. */
const ScribeSupporterCta = ({ onPress }: Props) => {
  const theme = useTheme()
  return (
    <SupporterCtaButton
      onPress={onPress}
      shimmer
      style={{ paddingVertical: 13, paddingHorizontal: 16 }}
    >
      <Text
        style={{
          color: '#343232',
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('md'),
        }}
      >
        {i18n.t('scribe_becomeSupporter')}
      </Text>
    </SupporterCtaButton>
  )
}

export default ScribeSupporterCta
