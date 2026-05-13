import moment from 'moment'
import { useCallback, useMemo } from 'react'
import * as Crypto from 'expo-crypto'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import {
  applyRollover,
  computePendingRollovers,
  PendingRollover,
} from '@/features/service-reports/lib/rollover'
import usePublisher from '@/hooks/usePublisher'

type RolloverContext = {
  pending: PendingRollover[]
  /**
   * Same shape as `pending` but ignores the per-month marker. Inline UI uses
   * this to keep offering rollover after the user has pressed "Not now" or
   * deleted the rollover pair — both leave the source month fractional.
   */
  availablePending: PendingRollover[]
  totalMinutes: number
  markerKey: string
  /** Apply pending rollover entries and stamp the marker. No-op if none. */
  apply: () => void
  /** Stamp the marker without applying — used for "Not now". */
  dismiss: () => void
  /** Toggle auto-mode for future months. */
  setAutoEnabled: (enabled: boolean) => void
  autoEnabled: boolean
}

export const useRollover = (): RolloverContext => {
  const { hasAnnualGoal, type: publisher } = usePublisher()
  const {
    lastRolloverYearMonth,
    autoRolloverEnabled,
    overrideCreditLimit,
    customCreditLimitHours,
    devRolloverDateOverride,
    set,
  } = usePreferences()
  const { serviceReports, addServiceReport } = useServiceReport()

  const overrideMs = devRolloverDateOverride
    ? new Date(devRolloverDateOverride).getTime()
    : null
  const today = useMemo(
    () => (overrideMs !== null ? moment(overrideMs) : moment()),
    [overrideMs]
  )
  const markerKey = today.format('YYYY-MM')

  const pending = useMemo(
    () =>
      computePendingRollovers({
        serviceReports,
        today,
        hasAnnualGoal,
        lastRolloverYearMonth,
        publisher,
        creditLimitOverride: {
          enabled: overrideCreditLimit,
          customLimitHours: customCreditLimitHours,
        },
      }),
    [
      serviceReports,
      today,
      hasAnnualGoal,
      lastRolloverYearMonth,
      publisher,
      overrideCreditLimit,
      customCreditLimitHours,
    ]
  )

  const availablePending = useMemo(
    () =>
      computePendingRollovers({
        serviceReports,
        today,
        hasAnnualGoal,
        lastRolloverYearMonth,
        publisher,
        creditLimitOverride: {
          enabled: overrideCreditLimit,
          customLimitHours: customCreditLimitHours,
        },
        ignoreMarker: true,
      }),
    [
      serviceReports,
      today,
      hasAnnualGoal,
      lastRolloverYearMonth,
      publisher,
      overrideCreditLimit,
      customCreditLimitHours,
    ]
  )

  const totalMinutes = pending.reduce((sum, p) => sum + p.minutes, 0)

  const apply = useCallback(() => {
    const prefs = usePreferences.getState()
    const liveOverride = prefs.devRolloverDateOverride
    const liveToday = liveOverride
      ? moment(new Date(liveOverride).getTime())
      : moment()
    const result = applyRollover({
      serviceReports: useServiceReport.getState().serviceReports,
      today: liveToday,
      hasAnnualGoal,
      lastRolloverYearMonth: prefs.lastRolloverYearMonth,
      publisher,
      creditLimitOverride: {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      },
      genId: () => Crypto.randomUUID(),
    })
    if (!result) {
      set({ lastRolloverYearMonth: markerKey })
      return
    }
    result.entries.forEach((entry) => addServiceReport(entry))
    set({ lastRolloverYearMonth: result.markerKey })
  }, [
    addServiceReport,
    customCreditLimitHours,
    hasAnnualGoal,
    markerKey,
    overrideCreditLimit,
    publisher,
    set,
  ])

  const dismiss = useCallback(() => {
    set({ lastRolloverYearMonth: markerKey })
  }, [markerKey, set])

  const setAutoEnabled = useCallback(
    (enabled: boolean) => {
      set({ autoRolloverEnabled: enabled })
    },
    [set]
  )

  return {
    pending,
    availablePending,
    totalMinutes,
    markerKey,
    apply,
    dismiss,
    setAutoEnabled,
    autoEnabled: autoRolloverEnabled,
  }
}
