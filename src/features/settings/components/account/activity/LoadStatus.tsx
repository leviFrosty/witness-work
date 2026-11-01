import { ActivityIndicator, View } from 'react-native'
import { RotateCw as RotateCwIcon } from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export default function LoadStatus({
  loading,
  message,
  onRetry,
}: {
  loading: boolean
  message: string | null
  onRetry: () => void
}) {
  const theme = useTheme()
  if (loading)
    return (
      <View style={{ paddingVertical: 30 }}>
        <ActivityIndicator color={theme.colors.textAlt} />
      </View>
    )
  if (!message) return null
  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          color: theme.colors.textAlt,
          textAlign: 'center',
          paddingHorizontal: 20,
        }}
      >
        {message}
      </Text>
      <Section>
        <InputRowButton
          leftIcon={RotateCwIcon}
          label={i18n.t('accountActivity_retry')}
          onPress={onRetry}
          lastInSection
        />
      </Section>
    </View>
  )
}
