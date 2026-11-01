import { digitSystemFor } from '@/lib/digits'
import { appLanguage } from '@/lib/numbers'
import { getEntryMode } from '@/lib/publisherCapabilities'
import { calendarMonthOf, roleForMonth } from '@/lib/roleHistory'
import { serviceStreakFor } from '@/lib/currentServiceStreak'
import { useConversations } from '@/stores/conversationStore'
import { usePet } from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import { defaultRoomFor } from '@/features/pet/lib/records'
import { localDayKey } from '@/features/pet/lib/dayKeys'
import {
  selectHeartsPace,
  selectPetActiveDays,
} from '@/features/pet/lib/petInputs'
import { petRegionCode } from '@/features/pet/lib/region'
import {
  buildSignData,
  NEXT_PLAN_LOOKAHEAD_DAYS,
} from '@/features/pet/lib/signData'
import { storedDayKey } from '@/lib/normalizeDate'
import { plannedMinutesForDay } from '@/lib/recurrence'
import { resolveMonthlyGoalHours } from '@/lib/monthlyGoals'
import moment from 'moment'
import type { DayPlan, RecurringPlan } from '@/types/timeEntry'
import {
  buildPetWidget,
  planPetWidget,
  type PetSignValues,
  type PetWidgetBuild,
  type PetWidgetEncoder,
  type PetWidgetInput,
  type PetWidgetPlan,
} from '@/app/widgets/petWidget'

export function readPetWidgetInput(
  now: Date,
  deviceRegion: string | null
): PetWidgetInput {
  const { pet, room } = usePet.getState()
  const prefs = usePreferences.getState()
  const { serviceReports, dayPlans, recurringPlans } =
    useServiceReport.getState()
  const visits = useConversations.getState().conversations
  const role = roleForMonth(prefs.roleHistory, prefs.role, calendarMonthOf(now))
  const records = { serviceReports, dayPlans, recurringPlans }
  const digits = digitSystemFor(appLanguage())

  const signs = new Map<string, PetSignValues>()
  const signAt = (at: Date): PetSignValues => {
    const key = localDayKey(at)
    const cached = signs.get(key)
    if (cached) return cached
    const month = calendarMonthOf(at)
    const publisher = roleForMonth(prefs.roleHistory, prefs.role, month)
    const sign = buildSignData({
      today: at,
      serviceReports,
      dayPlans,
      recurringPlans,
      visits,
      publisher,
      creditLimit: {
        enabled: prefs.overrideCreditLimit,
        customLimitHours: prefs.customCreditLimitHours,
      },
      monthGoalHours: resolveMonthlyGoalHours(
        prefs.publisherHours[publisher] ?? 0,
        prefs.monthlyGoalOverrides,
        month
      ),
      digits,
    })
    const values = {
      sign,
      nextPlanDate: planDateFor(sign.planDay, at, dayPlans, recurringPlans),
    }
    signs.set(key, values)
    return values
  }

  return {
    pet,
    room,
    roomDefaults: defaultRoomFor(getEntryMode(role)),
    activeDays: pet
      ? selectPetActiveDays({
          serviceReports,
          visits,
          dayPlans,
          recurringPlans,
        })
      : new Set(),
    heartsPace: selectHeartsPace(prefs.roleHistory, prefs.role),
    streakAt: (at) => serviceStreakFor(prefs, records, at),
    showStreaks: prefs.showStreaks,
    signAt,
    regionCode: petRegionCode(prefs.formatRegion, deviceRegion),
  }
}

function planDateFor(
  planDay: number | null,
  now: Date,
  dayPlans: DayPlan[],
  recurringPlans: RecurringPlan[]
): Date | null {
  if (planDay === null) return null
  const day = moment(now).startOf('day')
  for (let i = 0; i <= NEXT_PLAN_LOOKAHEAD_DAYS; i++, day.add(1, 'day')) {
    if (day.date() !== planDay) continue
    const key = day.format('YYYY-MM-DD')
    const minutes = plannedMinutesForDay(
      day.toDate(),
      dayPlans.filter((plan) => storedDayKey(plan.date) === key),
      recurringPlans
    )
    if (minutes > 0) return day.toDate()
  }
  return null
}

export function planPetWidgetSnapshot(
  now: Date,
  options: { deviceRegion: string | null }
): PetWidgetPlan | null {
  if (!usePet.getState().pet) return null
  return planPetWidget(readPetWidgetInput(now, options.deviceRegion), now)
}

export function buildPetWidgetSnapshot(
  now: Date,
  options: { encode: PetWidgetEncoder; deviceRegion: string | null }
): PetWidgetBuild {
  if (!usePet.getState().pet) return { snapshot: null, files: [], hash: null }
  return buildPetWidget(
    readPetWidgetInput(now, options.deviceRegion),
    now,
    options.encode
  )
}
