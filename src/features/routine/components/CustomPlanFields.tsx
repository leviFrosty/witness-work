import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import i18n from '@/lib/locales'
import { BIBLE_BOOKS } from '@/lib/routine/bible'
import {
  MAX_CHAPTERS_PER_DAY,
  MIN_CHAPTERS_PER_DAY,
} from '@/lib/routine/readingPlans'
import { choiceDays } from '@/features/routine/lib/readingPlanChoice'

const PACES = Array.from(
  { length: MAX_CHAPTERS_PER_DAY - MIN_CHAPTERS_PER_DAY + 1 },
  (_, index) => MIN_CHAPTERS_PER_DAY + index
)

export default function CustomPlanFields({
  startBook,
  chaptersPerDay,
  onChange,
  lastInSection,
}: {
  startBook: number
  chaptersPerDay: number
  onChange: (next: { startBook: number; chaptersPerDay: number }) => void
  lastInSection?: boolean
}) {
  const days = choiceDays({ kind: 'custom', startBook, chaptersPerDay }) ?? 0
  return (
    <>
      <InputRowSelect
        label={i18n.t('routine.plan.startBook')}
        selectProps={{
          data: BIBLE_BOOKS.map(([id], book) => ({
            label: i18n.t(`routine.bible.book.${id}`),
            value: book,
          })),
          value: startBook,
          onChange: ({ value }) =>
            onChange({ startBook: value, chaptersPerDay }),
        }}
      />
      <InputRowSelect
        label={i18n.t('routine.plan.chaptersLabel')}
        description={i18n.t('routine.plan.days', { count: days })}
        lastInSection={lastInSection}
        selectProps={{
          data: PACES.map((count) => ({
            label: i18n.t('routine.plan.chaptersPerDay', { count }),
            value: count,
          })),
          value: chaptersPerDay,
          onChange: ({ value }) =>
            onChange({ startBook, chaptersPerDay: value }),
        }}
      />
    </>
  )
}
