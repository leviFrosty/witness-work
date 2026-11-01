import { useEffect } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import DetailsLayout from '@/components/ui/layout/DetailsLayout'
import i18n from '@/lib/locales'
import { useServiceReport } from '@/stores/serviceReport'
import type { RootStackParamList } from '@/types/rootStack'
import WhosGoingList from '@/features/buddies/components/WhosGoingList'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { whosGoing } from '@/features/buddies/lib/guests'
import { effectiveShareStatus } from '@/features/buddies/lib/linkedPlans'
import { incomingShareKey } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

type Props = NativeStackScreenProps<RootStackParamList, 'Going List'>

export default function GoingListScreen({ route, navigation }: Props) {
  const { from, shareId } = route.params
  const enabled = useBuddiesEnabled()
  const share = useBuddies(
    (state) => state.incomingShares[incomingShareKey(from, shareId)]
  )
  const organizer = useBuddies((state) =>
    state.buddies.find((candidate) => candidate.inboxId === from)
  )
  const buddies = useBuddies((state) => state.buddies)
  const dayPlans = useServiceReport((state) => state.dayPlans)

  const status = share ? effectiveShareStatus(share, dayPlans) : 'cancelled'
  const open = enabled && !!organizer && status !== 'cancelled'

  useEffect(() => {
    if (!open && navigation.canGoBack()) navigation.goBack()
  }, [open, navigation])

  if (!open || !share) return null
  return (
    <DetailsLayout sheet title={i18n.t('planDetails_whosGoing')}>
      <WhosGoingList
        organizer={organizer}
        going={whosGoing(share, status, buddies)}
        status={status}
      />
    </DetailsLayout>
  )
}
