import { useNavigation } from '@react-navigation/native'
import ViewReportAction from '@/components/ViewReportButton'
import { RootStackNavigation } from '@/types/rootStack'

export default function ViewReportButton({
  month,
  year,
}: {
  month: number
  year: number
}) {
  const navigation = useNavigation<RootStackNavigation>()
  return (
    <ViewReportAction
      onPress={() => navigation.navigate('ServiceReportView', { month, year })}
    />
  )
}
