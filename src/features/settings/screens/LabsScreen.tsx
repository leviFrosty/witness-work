import { GroupedList } from '@/components/ui/GroupedList'
import LabSwitchesSection from '@/features/settings/components/labs/LabSwitchesSection'

const LabsScreen = () => (
  <GroupedList testID='labs'>
    <LabSwitchesSection />
  </GroupedList>
)

export default LabsScreen
