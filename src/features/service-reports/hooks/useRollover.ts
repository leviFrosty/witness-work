import moment from 'moment'
import { useCallback, useMemo } from 'react'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import {
  applyRollover,
  computeExcludedCreditMinutes,
  computePendingRollovers,
  PendingRollover,
  rolloverRole,
  rolloverSourceMonth,
} from '@/features/service-reports/lib/rollover'
import { addRolloverEntries } from '@/features/service-reports/lib/addRolloverEntries'
import usePublisher from '@/hooks/usePublisher'
import { publisherCapabilitiesForMonth } from '@/lib/roleHistory'
import { useShallow } from 'zustand/react/shallow'

type RolloverContext = {
  pending: PendingRollover[]

  availablePending: PendingRollover[]
  totalMinutes: number

  excludedCreditMinutes: number
  markerKey: string

  apply: () => void

  dismiss: () => void

  setAutoEnabled: (enabled: boolean) => void
  autoEnabled: boolean
}

export const useRollover = (): RolloverContext => {
  const {
    lastRolloverYearMonth,
    autoRolloverEnabled,
    rolloverIncludesCredit,
    overrideCreditLimit,
    customCreditLimitHours,
    devRolloverDateOverride,
    set,
  } = usePreferences(
    useShallow((s) => ({
      lastRolloverYearMonth: s.lastRolloverYearMonth,
      autoRolloverEnabled: s.autoRolloverEnabled,
      rolloverIncludesCredit: s.rolloverIncludesCredit,
      overrideCreditLimit: s.overrideCreditLimit,
      customCreditLimitHours: s.customCreditLimitHours,
      devRolloverDateOverride: s.devRolloverDateOverride,
      set: s.set,
    }))
  )
  const serviceReports = useServiceReport((state) => state.serviceReports)

  const overrideMs = devRolloverDateOverride
    ? new Date(devRolloverDateOverride).getTime()
    : null
  const today = useMemo(
    () => (overrideMs !== null ? moment(overrideMs) : moment()),
    [overrideMs]
  )
  const markerKey = today.format('YYYY-MM')

  const { hasAnnualGoal, publisher, destinationPublisher } = rolloverRole({
    source: usePublisher(rolloverSourceMonth(today)),
    destination: usePublisher({ year: today.year(), month: today.month() }),
  })

  const pending = useMemo(
    () =>
      computePendingRollovers({
        serviceReports,
        today,
        hasAnnualGoal,
        lastRolloverYearMonth,
        publisher,
        destinationPublisher,
        creditLimitOverride: {
          enabled: overrideCreditLimit,
          customLimitHours: customCreditLimitHours,
        },
        includeCredit: rolloverIncludesCredit,
      }),
    [
      serviceReports,
      today,
      hasAnnualGoal,
      lastRolloverYearMonth,
      publisher,
      destinationPublisher,
      overrideCreditLimit,
      customCreditLimitHours,
      rolloverIncludesCredit,
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
        destinationPublisher,
        creditLimitOverride: {
          enabled: overrideCreditLimit,
          customLimitHours: customCreditLimitHours,
        },
        includeCredit: rolloverIncludesCredit,
        ignoreMarker: true,
      }),
    [
      serviceReports,
      today,
      hasAnnualGoal,
      lastRolloverYearMonth,
      publisher,
      destinationPublisher,
      overrideCreditLimit,
      customCreditLimitHours,
      rolloverIncludesCredit,
    ]
  )

  const excludedCreditMinutes = useMemo(
    () =>
      computeExcludedCreditMinutes({
        serviceReports,
        today,
        hasAnnualGoal,
        publisher,
        creditLimitOverride: {
          enabled: overrideCreditLimit,
          customLimitHours: customCreditLimitHours,
        },
        includeCredit: rolloverIncludesCredit,
      }),
    [
      serviceReports,
      today,
      hasAnnualGoal,
      publisher,
      overrideCreditLimit,
      customCreditLimitHours,
      rolloverIncludesCredit,
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
      lastRolloverYearMonth: prefs.lastRolloverYearMonth,
      ...rolloverRole({
        source: publisherCapabilitiesForMonth(
          prefs,
          rolloverSourceMonth(liveToday)
        ),
        destination: publisherCapabilitiesForMonth(prefs, {
          year: liveToday.year(),
          month: liveToday.month(),
        }),
      }),
      creditLimitOverride: {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      },
      includeCredit: prefs.rolloverIncludesCredit,
    })
    if (!result) {
      set({ lastRolloverYearMonth: markerKey })
      return
    }
    addRolloverEntries(result.entries)
    set({ lastRolloverYearMonth: result.markerKey })
  }, [customCreditLimitHours, markerKey, overrideCreditLimit, set])

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
    excludedCreditMinutes,
    markerKey,
    apply,
    dismiss,
    setAutoEnabled,
    autoEnabled: autoRolloverEnabled,
  }
}
