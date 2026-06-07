import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { View, ScrollView, Switch } from 'react-native'
import { Sheet } from 'tamagui'
import { useToastController } from '@tamagui/toast'
import * as Crypto from 'expo-crypto'

import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import useTheme from '@/contexts/theme'
import {
  faTimes,
  faMinus,
  faPlus,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'

import i18n from '@/lib/locales'
import type { Recommendation } from '@/lib/assistantRecommendation'
import {
  projectStandardAddition,
  type ProjectedTotalResult,
} from '@/lib/projectedTotal'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { formatMinutes } from '@/lib/minutes'
import moment from 'moment'
import { segmentBoldMarkup } from '@/lib/projectedTotalCopy'

type Row = {
  /** Local-only id — never persisted; used as React key + stepper target. */
  rowId: string
  date: Date
  minutes: number
  /** When true, the row is excluded from "Add to Schedule". */
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

const buildInitialRows = (rec: Recommendation): Row[] =>
  rec.plans.map((p) => ({
    rowId: Crypto.randomUUID(),
    date: p.date,
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
  const toast = useToastController()
  const { addDayPlan, deleteDayPlan } = useServiceReport()
  const { planAlwaysNotify, timeDisplayFormat } = usePreferences()

  const [rows, setRows] = useState<Row[]>(() =>
    buildInitialRows(recommendation)
  )
  const [notifyMe, setNotifyMe] = useState<boolean>(planAlwaysNotify)
  const [pendingUndoIds, setPendingUndoIds] = useState<string[] | null>(null)

  // Reset local row state whenever the source recommendation changes (e.g.
  // user dismissed and re-armed the assistant with new inputs).
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

  // Mirror cap semantics (ADR 0005): proposed standard time can displace
  // capped credit, so the post-accept total is re-run through the month's
  // cap formula instead of summed linearly.
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
    onAccepted()
    setPendingUndoIds(newIds)
    toast.show(
      i18n.t('assistant.snackbar.addedPlans', { count: survivors.length }),
      {
        // Tamagui toast doesn't expose action buttons cross-platform, so the
        // inline undo affordance below the toast is the actionable surface.
        duration: 5000,
      }
    )
    onOpenChange(false)
  }, [rows, addDayPlan, notifyMe, onAccepted, toast, onOpenChange])

  // After 5 seconds the undo window closes — drop the pending-undo state so
  // the inline affordance disappears and tapping it after the fact can't
  // delete plans the user has since edited.
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
    onUndo()
    setPendingUndoIds(null)
  }, [pendingUndoIds, deleteDayPlan, onUndo])

  const footerText = i18n.t('assistant.preview.proposedTotal', {
    projected: projectedAfterDisplay,
  })
  const footerSegments = segmentBoldMarkup(footerText)

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        dismissOnSnapToBottom
        modal
        snapPoints={[70]}
      >
        <Sheet.Handle />
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame>
          <View style={{ padding: 20, flex: 1, gap: 15 }}>
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
                icon={faTimes}
                onPress={() => onOpenChange(false)}
              />
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: 8 }}
              keyboardShouldPersistTaps='handled'
            >
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
                      {moment(row.date).format('ddd, MMM D')}
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
                  <IconButton
                    icon={faMinus}
                    onPress={() => setRowMinutes(row.rowId, -HOUR_STEP_MINUTES)}
                    size={12}
                    color={theme.colors.textAlt}
                  />
                  <IconButton
                    icon={faPlus}
                    onPress={() => setRowMinutes(row.rowId, HOUR_STEP_MINUTES)}
                    size={12}
                    color={theme.colors.textAlt}
                  />
                  <IconButton
                    icon={faTrash}
                    onPress={() => toggleDropped(row.rowId)}
                    size={12}
                    color={
                      row.dropped ? theme.colors.warn : theme.colors.textAlt
                    }
                  />
                </View>
              ))}
            </ScrollView>

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
              <Switch value={notifyMe} onValueChange={setNotifyMe} />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                onPress={() => onOpenChange(false)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  paddingVertical: 12,
                  borderRadius: theme.numbers.borderRadiusSm,
                }}
                noTransform
              >
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('assistant.button.cancel')}
                </Text>
              </Button>
              <Button
                onPress={handleAddToSchedule}
                style={{
                  flex: 1,
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
          </View>
        </Sheet.Frame>
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
