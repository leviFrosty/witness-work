import ScribeSupporterCta from '@/app/components/ScribeSupporterCta'
import ScribeConversationScreen from '@/features/scribe/screens/ScribeConversationScreen'

/**
 * App-tier route composition: Scribe AI owns the conversation; Supporter owns
 * its upgrade button (kept out of the feature through this render prop).
 */
const ScribeConversationRouteScreen = () => (
  <ScribeConversationScreen
    renderSupporterCta={({ onPress }) => (
      <ScribeSupporterCta onPress={onPress} />
    )}
  />
)

export default ScribeConversationRouteScreen
