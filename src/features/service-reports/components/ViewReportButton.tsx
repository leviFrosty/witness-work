import { FileText as FileTextIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useNavigation } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'

interface ViewReportButtonProps {
  month: number
  year: number
}

const ViewReportButton = ({ month, year }: ViewReportButtonProps) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <Button
      accessibilityRole='button'
      accessibilityLabel={i18n.t('viewReport')}
      onPress={() => navigation.navigate('ServiceReportView', { month, year })}
      style={touchTargetFrame(18 + 2 * 4)}
    >
      <LucideIcon
        icon={FileTextIcon}
        size={18}
        style={{ color: theme.colors.textAlt }}
      />
    </Button>
  )
}

export default ViewReportButton
