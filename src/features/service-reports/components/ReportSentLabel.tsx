import { Check as CheckIcon } from 'lucide-react-native'
import { View } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

const ReportSentLabel = ({
  label,
  sent = true,
  trailing,
}: {
  label: string
  sent?: boolean
  trailing?: React.ReactNode
}) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {sent && (
        <LucideIcon icon={CheckIcon} size={12} color={theme.colors.accent} />
      )}
      <Text
        numberOfLines={1}
        style={{
          fontSize: theme.fontSize('xs'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {label}
      </Text>
      {trailing}
    </View>
  )
}

export default ReportSentLabel
