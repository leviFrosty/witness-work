import { useMemo } from 'react'

import CategoriesSection from '@/features/service-reports/components/CategoriesSection'
import type { CategorySegment } from '@/features/service-reports/components/CategorySegmentBar'
import { getCategorySegmentColors } from '@/features/service-reports/lib/categorySegmentColors'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { getCategoryBreakdownForServiceYear } from '@/lib/serviceReport'
import { getServiceYearReports } from '@/lib/serviceYear'

interface Props {
  /** End year of the service year (Sep 1 of `year - 1` → Aug 31 of `year`). */
  year: number
}

/**
 * Annual per-category breakdown sheet for the Progress screen's Year tab — the
 * service-year counterpart of the Month view's Categories sheet (issue #450).
 * Numbers are raw logged time, unadjusted for the monthly credit cap (a
 * capped-out month's overage can't be pinned on one category).
 */
const YearCategoryBreakdownSection = ({ year }: Props) => {
  const theme = useTheme()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const { categories } = useCategories()

  const breakdown = useMemo(
    () =>
      getCategoryBreakdownForServiceYear(
        getServiceYearReports(serviceReports, year - 1)
      ),
    [serviceReports, year]
  )

  const otherSegmentPalette = getCategorySegmentColors(theme.colors)
  const segments: CategorySegment[] = [
    {
      title: i18n.t('standard'),
      minutes: breakdown.standard,
      color: theme.colors.accent,
    },
    {
      title: i18n.t('ldc'),
      minutes: breakdown.ldc,
      color: theme.colors.accentAlt,
      credit: true,
    },
    ...breakdown.other.map((report, i) => {
      // Resolve the user-visible label live from the Categories store so a
      // rename propagates without re-running the year aggregation.
      const liveCategory = report.categoryId
        ? categories.find((c) => c.id === report.categoryId)
        : undefined
      const title = liveCategory?.name ?? report.tag
      return {
        title,
        minutes: report.minutes,
        color: otherSegmentPalette[i % otherSegmentPalette.length],
        credit: report.credit,
      }
    }),
  ]

  if (!segments.some((s) => s.minutes > 0)) return null

  return (
    <CategoriesSection
      segments={segments}
      description={i18n.t('categoryBreakdown_serviceYear_description')}
    />
  )
}

export default YearCategoryBreakdownSection
