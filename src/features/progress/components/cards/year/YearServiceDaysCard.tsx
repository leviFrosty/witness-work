import { getServiceYearReports } from '@/lib/serviceYear'
import useServiceReport from '@/stores/serviceReport'
import { ServiceDaysStatCard } from '@/features/progress/components/cards/ServiceDaysCard'
import type { YearCardProps } from '@/features/progress/components/cards/types'

/** How many days had time in the Service Year, and the average day out. */
export default function YearServiceDaysCard({
  serviceYear,
  size,
}: YearCardProps) {
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const reports = Object.values(
    getServiceYearReports(serviceReports, serviceYear)
  ).flatMap((months) => Object.values(months).flat())
  return <ServiceDaysStatCard reports={reports} size={size} />
}
