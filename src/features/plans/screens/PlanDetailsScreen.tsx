import { useEffect } from 'react'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import InvitationPlanDetails from '@/features/plans/components/InvitationPlanDetails'
import OwnPlanDetails from '@/features/plans/components/OwnPlanDetails'
import usePlanDetails from '@/features/plans/hooks/usePlanDetails'

type Props = NativeStackScreenProps<RootStackParamList, 'Plan Details'>

export default function PlanDetailsScreen({ route, navigation }: Props) {
  const { now, item, shared, invitation, gone, answering } = usePlanDetails(
    route.params,
    {
      onAnswer: (target) =>
        navigation.setParams({
          share: { from: target.from, shareId: target.shareId },
        }),
    }
  )

  useEffect(() => {
    if (gone && navigation.canGoBack()) navigation.goBack()
  }, [gone, navigation])

  if (item) {
    return (
      <OwnPlanDetails
        item={item}
        share={invitation}
        now={now}
        answering={answering}
      />
    )
  }
  if (shared) {
    return (
      <InvitationPlanDetails
        share={shared}
        answering={invitation ? answering : undefined}
      />
    )
  }
  return null
}
