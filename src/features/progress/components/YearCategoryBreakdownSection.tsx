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
  year: number
}

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
