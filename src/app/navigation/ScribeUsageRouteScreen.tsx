import ScribeSupporterCta from '@/app/components/ScribeSupporterCta'
import ScribeUsageScreen from '@/features/scribe/screens/ScribeUsageScreen'

const ScribeUsageRouteScreen = () => (
  <ScribeUsageScreen
    renderSupporterCta={({ onPress }) => (
      <ScribeSupporterCta onPress={onPress} />
    )}
  />
)

export default ScribeUsageRouteScreen
