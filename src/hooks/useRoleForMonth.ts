import { usePreferences } from '@/stores/preferences'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import { roleForMonth } from '@/lib/roleHistory'
import type { Publisher } from '@/types/publisher'

const useRoleForMonth = (): ((target: CalendarMonth) => Publisher) => {
  const role = usePreferences((s) => s.role)
  const roleHistory = usePreferences((s) => s.roleHistory)
  return (target) => roleForMonth(roleHistory, role, target)
}

export default useRoleForMonth
