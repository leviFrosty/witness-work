import { analytics } from '@/lib/analytics'
import {
  Minus as MinusIcon,
  Plus as PlusIcon,
  Trash2 as Trash2Icon,
  X as XIcon,
} from 'lucide-react-native'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import Switch from '@/components/ui/Switch'
import Sheet from '@/components/ui/Sheet'
import { toast } from '@/stores/toasts'
import * as Crypto from 'expo-crypto'

import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'

import i18n from '@/lib/locales'
import {
  proposedPlanLocalDay,
  type Recommendation,
} from '@/lib/assistantRecommendation'
import {
  projectStandardAddition,
  type ProjectedTotalResult,
} from '@/lib/projectedTotal'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { formatMinutes } from '@/lib/minutes'
import moment from 'moment'
import { segmentBoldMarkup } from '@/lib/projectedTotalCopy'
import { formatWeekdayMonthDayCompact } from '@/lib/dates'
import { noteUserAction } from '@/lib/userAction'

type Row = {
  rowId: string
  date: Date
  minutes: number

  dropped: boolean
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  recommendation: Recommendation
  projection: ProjectedTotalResult
  onAccepted: () => void
  onUndo: () => void
}

const HOUR_STEP_MINUTES = 30
const ROW_ICON_SIZE = 12

const rowButtonFrame = {
  ...touchTargetFrame(ROW_ICON_SIZE),
  marginHorizontal: 0,
}

const buildInitialRows = (rec: Recommendation): Row[] =>
  rec.plans.map((p) => ({
    rowId: Crypto.randomUUID(),
    date: proposedPlanLocalDay(p),
    minutes: p.minutes,
    dropped: false,
  }))

const AssistantPreviewSheet = ({
  open,
  onOpenChange,
  recommendation,
  projection,
  onAccepted,
  onUndo,
}: Props) => {
  const theme = useTheme()
  const { addDayPlan, deleteDayPlan } = useServiceReport()
  const { planAlwaysNotify, timeDisplayFormat } = usePreferences()

  const [rows, setRows] = useState<Row[]>(() =>
    buildInitialRows(recommendation)
  )
  const [notifyMe, setNotifyMe] = useState<boolean>(planAlwaysNotify)
  const [pendingUndoIds, setPendingUndoIds] = useState<string[] | null>(null)

  useEffect(() => {
    setRows(buildInitialRows(recommendation))
  }, [recommendation])

  useEffect(() => {
    if (!open) return
    setNotifyMe(planAlwaysNotify)
  }, [open, planAlwaysNotify])

  const totalProposedMinutes = useMemo(
    () => rows.filter((r) => !r.dropped).reduce((sum, r) => sum + r.minutes, 0),
    [rows]
  )

  const projectedAfter = projectStandardAddition(
    projection,
    totalProposedMinutes
  )
  const projectedAfterDisplay = formatMinutes(
    projectedAfter,
    timeDisplayFormat
  ).formatted
  const reachesGoal = projectedAfter >= projection.goalMinutes

  const setRowMinutes = useCallback((rowId: string, delta: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? { ...r, minutes: Math.max(0, r.minutes + delta) }
          : r
      )
    )
  }, [])

  const toggleDropped = useCallback((rowId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, dropped: !r.dropped } : r))
    )
  }, [])

  const handleAddToSchedule = useCallback(() => {
    const survivors = rows.filter((r) => !r.dropped && r.minutes > 0)
    const newIds: string[] = []
    noteUserAction('plan')
    for (const row of survivors) {
      const id = Crypto.randomUUID()
      newIds.push(id)
      addDayPlan({
        id,
        date: row.date,
        minutes: row.minutes,
        notifyMe,
        source: 'recommendation',
      })
    }
    analytics.capture('assistant_recommendation_accepted', {
      shape: recommendation.shape,
      plan_count: survivors.length,
      dropped_count: rows.length - survivors.length,
      reminder_enabled: notifyMe,
    })
    onAccepted()
    setPendingUndoIds(newIds)
    toast.success(
      i18n.t('assistant.snackbar.addedPlans', { count: survivors.length }),
      {
        durationMs: 5000,
      }
    )
    onOpenChange(false)
  }, [
    rows,
    addDayPlan,
    notifyMe,
    onAccepted,
    onOpenChange,
    recommendation.shape,
  ])

  useEffect(() => {
    if (pendingUndoIds === null) return
    const t = setTimeout(() => setPendingUndoIds(null), 5500)
    return () => clearTimeout(t)
  }, [pendingUndoIds])

  const handleUndo = useCallback(() => {
    if (pendingUndoIds === null) return
    for (const id of pendingUndoIds) {
      deleteDayPlan(id)
    }
    analytics.capture('assistant_recommendation_undone', {
      plan_count: pendingUndoIds.length,
    })
    onUndo()
    setPendingUndoIds(null)
  }, [pendingUndoIds, deleteDayPlan, onUndo])

  const footerText = i18n.t('assistant.preview.proposedTotal', {
    projected: projectedAfterDisplay,
  })
  const footerSegments = segmentBoldMarkup(footerText)

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <View style={{ flexShrink: 1, padding: 20, gap: 15 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('assistant.label')}
            </Text>
            <IconButton
              noTransform
              icon={XIcon}
              onPress={() => onOpenChange(false)}
            />
          </View>

          <Sheet.ScrollView contentContainerStyle={{ gap: 8 }}>
            {rows.map((row) => (
              <View
                key={row.rowId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: theme.numbers.borderRadiusSm,
                  backgroundColor: theme.colors.backgroundLighter,
                  opacity: row.dropped ? 0.4 : 1,
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {formatWeekdayMonthDayCompact(moment(row.date))}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('xs'),
                    }}
                  >
                    {formatMinutes(row.minutes, timeDisplayFormat).formatted}
                  </Text>
                </View>
                {}
                <View style={{ flexDirection: 'row' }}>
                  <IconButton
                    icon={MinusIcon}
                    style={rowButtonFrame}
                    onPress={() => setRowMinutes(row.rowId, -HOUR_STEP_MINUTES)}
                    size={ROW_ICON_SIZE}
                    color={theme.colors.textAlt}
                    accessibilityLabel={i18n.t('decrease')}
                  />
                  <IconButton
                    icon={PlusIcon}
                    style={rowButtonFrame}
                    onPress={() => setRowMinutes(row.rowId, HOUR_STEP_MINUTES)}
                    size={ROW_ICON_SIZE}
                    color={theme.colors.textAlt}
                    accessibilityLabel={i18n.t('increase')}
                  />
                  <IconButton
                    icon={Trash2Icon}
                    style={rowButtonFrame}
                    onPress={() => toggleDropped(row.rowId)}
                    size={ROW_ICON_SIZE}
                    color={
                      row.dropped ? theme.colors.warn : theme.colors.textAlt
                    }
                    accessibilityLabel={i18n.t(
                      row.dropped ? 'restore' : 'remove'
                    )}
                  />
                </View>
              </View>
            ))}
          </Sheet.ScrollView>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            <Text style={{ fontSize: theme.fontSize('sm') }}>
              {footerSegments.map((s, i) => (
                <Fragment key={i}>
                  <Text
                    style={
                      s.bold
                        ? {
                            fontFamily: theme.fonts.bold,
                            fontSize: theme.fontSize('sm'),
                          }
                        : { fontSize: theme.fontSize('sm') }
                    }
                  >
                    {s.text}
                  </Text>
                </Fragment>
              ))}
              {reachesGoal ? (
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.accent,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {`  · ${i18n.t('assistant.preview.goalReached')} ✓`}
                </Text>
              ) : null}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('assistant.preview.notifyMe')}
            </Text>
            <Switch
              accessibilityLabel={i18n.t('assistant.preview.notifyMe')}
              value={notifyMe}
              onValueChange={setNotifyMe}
            />
          </View>

          <Button
            onPress={handleAddToSchedule}
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.accent,
              paddingVertical: 12,
              borderRadius: theme.numbers.borderRadiusSm,
            }}
          >
            <Text
              style={{
                color: theme.colors.textInverse,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('assistant.button.addToSchedule')}
            </Text>
          </Button>
        </View>
      </Sheet>

      {pendingUndoIds !== null && (
        <View
          style={{
            position: 'absolute',
            bottom: 80,
            left: 16,
            right: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: theme.colors.card,
            borderRadius: theme.numbers.borderRadiusSm,
            borderWidth: 1,
            borderColor: theme.colors.border,
            shadowColor: theme.colors.shadow,
            shadowOpacity: theme.numbers.shadowOpacity,
            shadowOffset: { width: 0, height: 2 },
          }}
        >
          <Text style={{ fontSize: theme.fontSize('sm') }}>
            {i18n.t('assistant.snackbar.addedPlans', {
              count: pendingUndoIds.length,
            })}
          </Text>
          <Button onPress={handleUndo} noTransform>
            <Text
              style={{
                color: theme.colors.accent,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('assistant.button.undo')}
            </Text>
          </Button>
        </View>
      )}
    </>
  )
}

export default AssistantPreviewSheet
