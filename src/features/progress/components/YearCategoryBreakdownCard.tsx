import { ChartPie as ChartPieIcon } from 'lucide-react-native'
import { useMemo } from 'react'
import { View } from 'react-native'

import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import CategorySegmentBar, {
  CategorySegment,
} from '@/features/service-reports/components/CategorySegmentBar'
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
 * Annual per-category breakdown card for the Progress screen's Year tab — the
 * service-year counterpart of the Month view's Categories sheet (issue #450).
 * Numbers are raw logged time, unadjusted for the monthly credit cap (a
 * capped-out month's overage can't be pinned on one category).
 */
const YearCategoryBreakdownCard = ({ year }: Props) => {
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

  // Must stay in sync with MonthReport / MonthServiceReportProgressBar's
  // palette so the Year view tells the same color story as the Month view.
  const otherSegmentPalette = [
    theme.colors.accent2,
    theme.colors.accent2Alt,
    theme.colors.warn,
    theme.colors.warnAlt,
    theme.colors.accent3,
    theme.colors.accent3Alt,
  ]
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
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LucideIcon
          icon={ChartPieIcon}
          size={14}
          style={{ color: theme.colors.textAlt }}
        />
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {i18n.t('categoryBreakdown')}
        </Text>
      </View>
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {i18n.t('categoryBreakdown_serviceYear_description')}
      </Text>
      <CategorySegmentBar segments={segments} />
    </Card>
  )
}

export default YearCategoryBreakdownCard
