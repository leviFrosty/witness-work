import ScribeSupporterCta from '@/app/components/ScribeSupporterCta'
import ScribeUsageScreen from '@/features/scribe/screens/ScribeUsageScreen'

/** Settings → Scribe AI usage, with Supporter's upgrade button. */
const ScribeUsageRouteScreen = () => (
  <ScribeUsageScreen
    renderSupporterCta={({ onPress }) => (
      <ScribeSupporterCta onPress={onPress} />
    )}
  />
)

export default ScribeUsageRouteScreen
