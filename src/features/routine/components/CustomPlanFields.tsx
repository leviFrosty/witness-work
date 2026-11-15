import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import i18n from '@/lib/locales'
import { BIBLE_BOOKS } from '@/lib/routine/bible'
import {
  MAX_CHAPTERS_PER_DAY,
  MIN_CHAPTERS_PER_DAY,
  MIN_VERSES_PER_DAY,
  type ReadingUnit,
} from '@/lib/routine/readingPlans'
import { planSummary } from '@/features/routine/lib/planSummary'
import {
  defaultAmount,
  withBooks,
  type CustomPlanChoice,
} from '@/features/routine/lib/readingPlanChoice'

const CHAPTER_COUNTS = Array.from(
  { length: MAX_CHAPTERS_PER_DAY - MIN_CHAPTERS_PER_DAY + 1 },
  (_, index) => MIN_CHAPTERS_PER_DAY + index
)

const VERSE_COUNTS = [
  ...Array.from({ length: 10 - MIN_VERSES_PER_DAY + 1 }, (_, i) => i + 2),
  12,
  15,
  20,
]

const UNITS: readonly ReadingUnit[] = ['chapters', 'verses']

export default function CustomPlanFields({
  choice,
  onChange,
  indented,
  lastInSection,
}: {
  choice: CustomPlanChoice
  onChange: (next: CustomPlanChoice) => void
  indented?: boolean
  lastInSection?: boolean
}) {
  const books = BIBLE_BOOKS.map(([id], book) => ({
    label: i18n.t(`routine.bible.book.${id}`),
    value: book,
  }))
  const { unit, count } = choice.amount
  const counts = unit === 'verses' ? VERSE_COUNTS : CHAPTER_COUNTS
  return (
    <>
      <InputRowSelect
        indented={indented}
        label={i18n.t('routine.plan.startBook')}
        selectProps={{
          data: books,
          value: choice.startBook,
          onChange: ({ value }) =>
            onChange(withBooks(choice, { startBook: value })),
        }}
      />
      <InputRowSelect
        indented={indented}
        label={i18n.t('routine.plan.endBook')}
        selectProps={{
          data: books,
          value: choice.endBook,
          onChange: ({ value }) =>
            onChange(withBooks(choice, { endBook: value })),
        }}
      />
      <InputRowSelect
        indented={indented}
        label={i18n.t('routine.plan.unitLabel')}
        selectProps={{
          data: UNITS.map((value) => ({
            label: i18n.t(`routine.plan.unit.${value}`),
            value,
          })),
          value: unit,
          onChange: ({ value }) =>
            value !== unit &&
            onChange({ ...choice, amount: defaultAmount(value) }),
        }}
      />
      <InputRowSelect
        indented={indented}
        label={i18n.t('routine.plan.chaptersLabel')}
        description={planSummary(choice)}
        lastInSection={lastInSection}
        selectProps={{
          data: counts.map((value) => ({
            label: i18n.t(
              unit === 'verses'
                ? 'routine.plan.versesPerDay'
                : 'routine.plan.chaptersPerDay',
              { count: value }
            ),
            value,
          })),
          value: count,
          onChange: ({ value }) =>
            onChange({ ...choice, amount: { unit, count: value } }),
        }}
      />
    </>
  )
}
