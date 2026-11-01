import PaywallScreen from '@/features/supporter/screens/PaywallScreen'
import { useScribeOffered } from '@/features/scribe'

const PaywallRouteScreen = () => {
  const scribeAi = useScribeOffered()
  return <PaywallScreen scribeAi={scribeAi} />
}

export default PaywallRouteScreen
