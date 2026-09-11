import { useNavigation } from '@react-navigation/native'
import Card from '@/components/ui/Card'
import DayHistoryView from '@/features/service-reports/components/DayHistoryView'
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
        onDayPlanPress={(plan) =>
          navigation.navigate('PlanDay', {
            date: dateString,
            existingDayPlanId: plan.id,
          })
        }
        onRecurringPlanPress={(plan) =>
          navigation.navigate('PlanDay', {
            date: dateString,
            existingRecurringPlanId: plan.id,
            recurringPlanDate: dateString,
          })
        }
        onTimeReportPress={(report) =>
          navigation.navigate('Add Time', {
            existingReport: JSON.stringify(report),
          })
        }
        onAddTime={() => navigation.navigate('Add Time', { date: dateString })}
        onPlanDay={() => navigation.navigate('PlanDay', { date: dateString })}
      />
    </Card>
  )
}
