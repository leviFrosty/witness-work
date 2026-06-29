import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import SupporterCtaButton from '@/features/supporter/components/SupporterCtaButton'

interface Props {
  onPress: () => void
}

/** App-tier adapter used wherever Notes Import composes with Supporter UI. */
const NotesImportSupporterCta = ({ onPress }: Props) => {
  const theme = useTheme()
  return (
    <SupporterCtaButton
      onPress={onPress}
      shimmer
      style={{ paddingVertical: 11, paddingHorizontal: 16 }}
    >
      <Text
        style={{
          color: '#343232',
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {i18n.t('notesImport_usageSupporterCta')}
      </Text>
    </SupporterCtaButton>
  )
}

export default NotesImportSupporterCta
