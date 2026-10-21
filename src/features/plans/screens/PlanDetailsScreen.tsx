import { useEffect } from 'react'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import InvitationPlanDetails from '@/features/plans/components/InvitationPlanDetails'
import OwnPlanDetails from '@/features/plans/components/OwnPlanDetails'
import usePlanDetails from '@/features/plans/hooks/usePlanDetails'

type Props = NativeStackScreenProps<RootStackParamList, 'Plan Details'>

/**
 * One Plan, read-only, with Edit and the Plan's other actions in the header.
 * Leaves once the Plan is gone (deleted here, in the editor, or on another
 * device), except a buddy's invitation, which stays so a "Can't make it" can be
 * changed back.
 */
export default function PlanDetailsScreen({ route, navigation }: Props) {
  const { now, item, shared, invitation, gone, answering } = usePlanDetails(
    route.params,
    {
      // Remembered first: "Can't make it" removes the linked Plan, and the
      // screen falls back to the invitation.
      onAnswer: (target) =>
        navigation.setParams({
          share: { from: target.from, shareId: target.shareId },
        }),
    }
  )

  // Deleted here, from the editor, on another device, or the invitation was
  // cancelled.
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
