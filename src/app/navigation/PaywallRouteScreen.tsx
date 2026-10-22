import PaywallScreen from '@/features/supporter/screens/PaywallScreen'
import { useScribeEnabled } from '@/features/scribe'

/**
 * App-tier composition for Supporter UI that lists Scribe AI's limits while
 * Scribe AI is on.
 */
const PaywallRouteScreen = () => {
  const scribeAi = useScribeEnabled()
  return <PaywallScreen scribeAi={scribeAi} />
}

export default PaywallRouteScreen
