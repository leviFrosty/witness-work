import { Fragment, type ReactNode } from 'react'
import { Alert, View } from 'react-native'
import {
  Calendar as CalendarIcon,
  ChevronDown as ChevronDownIcon,
  Clock as ClockIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import Switch from '@/components/ui/Switch'
import FormRow, {
  FORM_ROW_MIN_HEIGHT,
  FormRowLabel,
} from '@/components/ui/inputs/FormRow'
import NoteFormRow from '@/components/ui/inputs/NoteFormRow'
import Section, { SectionRows } from '@/components/ui/inputs/Section'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import RouteSectionLabel from '@/features/route-planning/components/RouteSectionLabel'
import type {
  RouteBuilder,
  RoutePlanOption,
} from '@/features/route-planning/hooks/useRouteBuilder'

export default function RouteDetails({
  builder,
  buddies,
}: {
  builder: RouteBuilder
  buddies?: ReactNode
}) {
  const theme = useTheme()
  const { note, setNote } = builder

  const linked = builder.linkedPlan
  const planLabel = linked ? planText(linked) : i18n.t('none')

  const confirmStartOver = () =>
    Alert.alert(
      i18n.t('routeBuilder_startOver'),
      i18n.t('routeBuilder_startOverConfirm'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('routeBuilder_startOver'),
          style: 'destructive',
          onPress: builder.reset,
        },
      ]
    )

  return (
    <View style={{ gap: 8 }}>
      <RouteSectionLabel>{i18n.t('routeBuilder_details')}</RouteSectionLabel>
      <Section animateRows={false}>
        {}
        <View style={{ marginTop: -1 }}>
          <SectionRows>
            {builder.planOptions.length > 0 && (
              <FormRow key='plan' icon={CalendarIcon}>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <FormRowLabel>{i18n.t('routeBuilder_plan')}</FormRowLabel>
                    <InfoPopover
                      inline
                      title={i18n.t('routeBuilder_plan')}
                      description={i18n.t('routeBuilder_planInfo')}
                    />
                  </View>
                  <PullDownMenu
                    accessibilityLabel={i18n.t('routeBuilder_plan')}
                    accessibilityValue={planLabel}
                    hoverRadius={8}
                    fill
                    style={{ flex: 1, minWidth: 0 }}
                    actions={[
                      [
                        {
                          id: 'none',
                          title: i18n.t('none'),
                          checked: !linked,
                          onPress: () => builder.linkPlan(null),
                        },
                      ],
                      builder.planOptions.map((plan) => ({
                        id: plan.id,
                        title: planText(plan),
                        systemImage: 'calendar',
                        checked: plan.id === linked?.id,
                        onPress: () => builder.linkPlan(plan.id),
                      })),
                    ]}
                  >
                    <View
                      style={{
                        minHeight: FORM_ROW_MIN_HEIGHT,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 4,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          flexShrink: 1,
                          color: linked
                            ? theme.colors.text
                            : theme.colors.textAlt,
                        }}
                      >
                        {planLabel}
                      </Text>
                      <LucideIcon
                        icon={ChevronDownIcon}
                        size={16}
                        color={theme.colors.textAlt}
                      />
                    </View>
                  </PullDownMenu>
                </View>
              </FormRow>
            )}

            {buddies && <Fragment key='buddies'>{buddies}</Fragment>}

            {}
            {builder.hasSetTimes && (
              <FormRow
                key='setTimes'
                icon={ClockIcon}
                trailing={
                  <View
                    style={{
                      height: FORM_ROW_MIN_HEIGHT,
                      justifyContent: 'center',
                    }}
                  >
                    <Switch
                      value={builder.keepSetTimes}
                      onValueChange={builder.setKeepSetTimes}
                      accessibilityLabel={i18n.t('routeBuilder_keepSetTimes')}
                    />
                  </View>
                }
              >
                <View style={{ paddingVertical: 8, gap: 2 }}>
                  <FormRowLabel>
                    {i18n.t('routeBuilder_keepSetTimes')}
                  </FormRowLabel>
                  <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
                    {i18n.t(
                      builder.keepSetTimes
                        ? 'routeBuilder_keepSetTimesOn'
                        : 'routeBuilder_keepSetTimesOff'
                    )}
                  </Text>
                </View>
              </FormRow>
            )}

            {}
            <NoteFormRow
              key='note'
              note={note}
              onChange={setNote}
              surface='route'
              allowImages={false}
              label={i18n.t('routeBuilder_notes')}
              placeholder={i18n.t('routeBuilder_notesPlaceholder')}
              testID='route-note'
            />
          </SectionRows>
        </View>
      </Section>

      {builder.edited && (
        <Button
          onPress={confirmStartOver}
          accessibilityLabel={i18n.t('routeBuilder_startOver')}
          style={{
            alignSelf: 'center',
            paddingVertical: 10,
            paddingHorizontal: 16,
          }}
        >
          <Text
            style={{
              color: theme.colors.error,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('routeBuilder_startOver')}
          </Text>
        </Button>
      )}
    </View>
  )
}

const planText = (plan: RoutePlanOption) => {
  const time = plan.anytime ? i18n.t('planAnytime') : formatStartTime(plan.time)
  return plan.title === time ? time : `${plan.title} · ${time}`
}
