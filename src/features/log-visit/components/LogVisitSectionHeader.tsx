import { View } from 'react-native'
import SuggestedSectionHeader, {
  type SuggestedHeaderSection,
} from '@/components/SuggestedSectionHeader'

export default function LogVisitSectionHeader({
  title,
  section,
}: {
  title: string
  section: SuggestedHeaderSection
}) {
  return (
    <View style={{ paddingTop: 14, paddingBottom: 6 }}>
      <SuggestedSectionHeader title={title} section={section} />
    </View>
  )
}
