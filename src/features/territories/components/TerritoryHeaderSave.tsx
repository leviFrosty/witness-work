import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import { webTextTargetFrame } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export default function TerritoryHeaderSave({
  onPress,
  testID,
}: {
  onPress: () => void
  testID: string
}) {
  const theme = useTheme()
  return (
    <Button
      submitShortcut
      onPress={onPress}
      testID={testID}
      style={{
        position: 'absolute',
        right: 0,
        ...webTextTargetFrame('end'),
      }}
    >
      <Text
        style={{
          color: theme.colors.text,
          textDecorationLine: 'underline',
          fontSize: 16,
        }}
      >
        {i18n.t('save')}
      </Text>
    </Button>
  )
}
