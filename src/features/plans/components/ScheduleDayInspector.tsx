import { useNavigation } from '@react-navigation/native'
import Card from '@/components/ui/Card'
import DayHistoryView from '@/features/service-reports/components/DayHistoryView'
import BuddyPlansForDay from '@/features/buddies/components/BuddyPlansForDay'
import PlanBuddiesLine from '@/features/buddies/components/PlanBuddiesLine'
import TodayRouteEntry from '@/features/route-planning/components/TodayRouteEntry'
import { RootStackNavigation } from '@/types/rootStack'
import { TimeEntry } from '@/types/timeEntry'

/** A persistent day workspace beside the calendar on larger windows. */
export default function ScheduleDayInspector({
  date,
  reports,
}: {
  date: Date
  reports: TimeEntry[]
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const dateString = date.toISOString()
  return (
    <Card>
      <DayHistoryView
        key={dateString}
        date={date}
        serviceReports={reports}
        showHeader
        onTimeReportPress={(report) =>
          navigation.navigate('Add Time', {
            existingReport: JSON.stringify(report),
          })
        }
        onAddTime={() => navigation.navigate('Add Time', { date: dateString })}
        onPlanDay={() => navigation.navigate('PlanDay', { date: dateString })}
        renderDayPlanFooter={(plan) => <PlanBuddiesLine plan={plan} />}
      />
      <TodayRouteEntry date={date} surface='schedule_inspector' />
      <BuddyPlansForDay date={date} onNavigate={(go) => go()} />
    </Card>
  )
}
