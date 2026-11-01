import useCategories from '@/stores/categories'
import useServiceReport from '@/stores/serviceReport'
import { allTimeEntries } from '@/features/scribe/runtime/snapshot'
import type {
  CategoryTarget,
  DraftEffectOf,
} from '@/features/scribe/proposals/model'
import type {
  ApplyContext,
  ApplyOutcome,
  UndoOutcome,
} from '@/features/scribe/proposals/effects/types'

export function resolveCategoryId(
  target: CategoryTarget,
  ctx: ApplyContext
): string | null | undefined {
  if (target.type === 'standard') return null
  if (target.type === 'pending') return ctx.bound.get(target.ref)
  return useCategories.getState().categories.some((c) => c.id === target.id)
    ? target.id
    : undefined
}

export function applyCategoryCreate(
  draft: DraftEffectOf<'category.create'>,
  ctx: ApplyContext
): ApplyOutcome {
  const id = ctx.newId()
  useCategories
    .getState()
    .addCategory({ id, name: draft.name, isCredit: draft.credit })
  ctx.bound.set(draft.ref, id)
  return {
    status: 'applied',
    undo: { kind: 'category.create', categoryId: id, ref: draft.ref },
  }
}

function categoryInUse(
  categoryId: string,
  except: ReadonlySet<string>
): boolean {
  const { serviceReports, dayPlans, recurringPlans } =
    useServiceReport.getState()
  return (
    allTimeEntries(serviceReports).some(
      (entry) => entry.categoryId === categoryId && !except.has(entry.id)
    ) ||
    dayPlans.some(
      (plan) => plan.categoryId === categoryId && !except.has(plan.id)
    ) ||
    recurringPlans.some((plan) => plan.categoryId === categoryId)
  )
}

export function undoCategoryCreate(
  categoryId: string,
  ownRecordIds: ReadonlySet<string>
): UndoOutcome {
  const category = useCategories
    .getState()
    .categories.find((c) => c.id === categoryId)
  if (!category) return 'gone'
  if (categoryInUse(categoryId, ownRecordIds)) return 'kept'
  useCategories.getState().deleteCategory(categoryId)
  return 'undone'
}
