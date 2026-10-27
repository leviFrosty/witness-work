import PaywallScreen from '@/features/supporter/screens/PaywallScreen'
import { useScribeOffered } from '@/features/scribe'

/**
 * App-tier composition for Supporter UI that lists Scribe AI's limits while
 * Scribe AI is offered, even if this User turned it off.
 */
const PaywallRouteScreen = () => {
  const scribeAi = useScribeOffered()
  return <PaywallScreen scribeAi={scribeAi} />
}

export default PaywallRouteScreen
