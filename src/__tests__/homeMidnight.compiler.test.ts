import { expect, it } from 'vitest'
import { cachedClockReads } from '@/__tests__/helpers/cachedClockReads'

// Home stays mounted for days. What it shows for "today" or "this month" comes
// from `useLocalDay`/`useNow`, so it moves on at midnight and on return.
it.each([
  'src/features/onboarding/components/HomeChecklist.tsx',
  'src/features/mileage/components/MileageDailyChart.tsx',
  'src/features/mileage/components/MileageHomeSection.tsx',
  'src/features/profile/components/HomeGreeting.tsx',
  'src/features/route-planning/components/TodayRouteAction.tsx',
  'src/features/service-reports/components/PublisherCheckBoxCard.tsx',
  'src/features/service-reports/components/ServiceReportSection.tsx',
  'src/features/service-reports/components/ServiceReportStudiesOverlay.tsx',
  'src/features/service-reports/components/ServiceReportTimeOverlay.tsx',
  'src/features/service-reports/hooks/useDueReportMonth.ts',
  'src/features/service-reports/hooks/useThisMonthTotals.ts',
  'src/features/visits/components/ApproachingConversations.tsx',
  'src/features/visits/hooks/useFollowUpCardItems.ts',
])('%s keeps no clock read across renders', (file) => {
  expect(cachedClockReads(file)).toEqual([])
})
