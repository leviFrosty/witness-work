import ScribeSupporterCta from '@/app/components/ScribeSupporterCta'
import ScribeConversationScreen from '@/features/scribe/screens/ScribeConversationScreen'

const ScribeConversationRouteScreen = () => (
  <ScribeConversationScreen
    renderSupporterCta={({ onPress }) => (
      <ScribeSupporterCta onPress={onPress} />
    )}
  />
)

export default ScribeConversationRouteScreen
