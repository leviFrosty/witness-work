import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import { dayRouteStops } from '@/features/route-planning/lib/routeStops'

/** Today's (or `day`'s) Follow-ups and Plans that have a map location. */
export default function useDayRouteStops(day: Date) {
  const conversations = useConversations((s) => s.conversations)
  const contacts = useContacts((s) => s.contacts)
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  return dayRouteStops({
    day,
    conversations,
    contacts,
    dayPlans,
    recurringPlans,
  })
}
