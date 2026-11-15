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
  type ReadingPlanChoice,
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

const YEAR_PACE = 0

const UNITS: readonly ReadingUnit[] = ['chapters', 'verses']

export default function PlanFields({
  choice,
  onChange,
  indented,
  lastInSection,
}: {
  choice: ReadingPlanChoice
  onChange: (next: ReadingPlanChoice) => void
  indented?: boolean
  lastInSection?: boolean
}) {
  const books = BIBLE_BOOKS.map(([id], book) => ({
    label: i18n.t(`routine.bible.book.${id}`),
    value: book,
  }))
  const unit = choice.amount?.unit ?? 'chapters'
  const yearPace = choice.kind !== 'custom' && unit === 'chapters'
  const counts = [
    ...(yearPace
      ? [{ label: i18n.t('routine.plan.yearPace'), value: YEAR_PACE }]
      : []),
    ...(unit === 'verses' ? VERSE_COUNTS : CHAPTER_COUNTS).map((value) => ({
      label: i18n.t(
        unit === 'verses'
          ? 'routine.plan.versesPerDay'
          : 'routine.plan.chaptersPerDay',
        { count: value }
      ),
      value,
    })),
  ]
  const setUnit = (next: ReadingUnit) => {
    if (next === unit) return
    if (choice.kind === 'custom')
      return onChange({ ...choice, amount: defaultAmount(next) })
    onChange(
      next === 'chapters'
        ? { kind: choice.kind }
        : { kind: choice.kind, amount: defaultAmount(next) }
    )
  }
  const setCount = (count: number) => {
    if (choice.kind === 'custom')
      return onChange({ ...choice, amount: { unit, count } })
    onChange(
      count === YEAR_PACE
        ? { kind: choice.kind }
        : { kind: choice.kind, amount: { unit, count } }
    )
  }
  return (
    <>
      {choice.kind === 'custom' && (
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
        </>
      )}
      <InputRowSelect
        indented={indented}
        label={i18n.t('routine.plan.unitLabel')}
        selectProps={{
          data: UNITS.map((value) => ({
            label: i18n.t(`routine.plan.unit.${value}`),
            value,
          })),
          value: unit,
          onChange: ({ value }) => setUnit(value),
        }}
      />
      <InputRowSelect
        indented={indented}
        label={i18n.t('routine.plan.chaptersLabel')}
        description={planSummary(choice)}
        lastInSection={lastInSection}
        selectProps={{
          data: counts,
          value: choice.amount?.count ?? YEAR_PACE,
          onChange: ({ value }) => setCount(value),
        }}
      />
    </>
  )
}
