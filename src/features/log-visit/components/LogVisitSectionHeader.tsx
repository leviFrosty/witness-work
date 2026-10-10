import { View } from 'react-native'
import SuggestedSectionHeader, {
  type SuggestedHeaderSection,
} from '@/components/SuggestedSectionHeader'

/** Small uppercase label above each part of the picker's list. */
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
