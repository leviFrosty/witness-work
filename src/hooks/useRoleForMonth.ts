import { usePreferences } from '@/stores/preferences'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { roleForMonth } from '@/lib/roleHistory'
import type { Publisher } from '@/types/publisher'

/**
 * Returns a resolver for the Publisher role that applied to any calendar month
 * (per the User's **Role History**). For surfaces that walk many months at once
 * — e.g. a Service Year total capped month by month.
 */
const useRoleForMonth = (): ((target: CalendarMonth) => Publisher) => {
  const role = usePreferences((s) => s.role)
  const roleHistory = usePreferences((s) => s.roleHistory)
  return (target) => roleForMonth(roleHistory, role, target)
}

export default useRoleForMonth
