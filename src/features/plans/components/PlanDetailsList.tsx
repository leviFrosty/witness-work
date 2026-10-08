import { ReactNode, useRef, useState } from 'react'
import { Keyboard, View } from 'react-native'
import type { InputRef } from 'tamagui'
import {
  Bell as BellIcon,
  Flag as FlagIcon,
  MapPin as MapPinIcon,
  NotebookPen as NotebookPenIcon,
  Tag as TagIcon,
  Type as TypeIcon,
  Users as UsersIcon,
  X as XIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import DateTimePicker from '@/components/ui/DateTimePicker'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Switch from '@/components/ui/Switch'
import TextInput from '@/components/ui/TextInput'
import Section from '@/components/ui/inputs/Section'
import PlaceSearchInput from '@/components/PlaceSearchInput'
import TypeSelectorRow, {
  type TypeSelection,
} from '@/components/TypeSelectorRow'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatPlanLocation, toPlanLocation } from '@/lib/placeSearch'
import type { PlanLocation } from '@/types/timeEntry'
import PlanFormRow, {
  PLAN_ROW_MIN_HEIGHT,
  PLAN_ROW_PADDING_X,
  PlanFormAddBadge,
  PlanFormChevron,
  PlanFormRowLabel,
  PlanFormRowValue,
  planRowInputStyle,
} from '@/features/plans/components/PlanFormRow'
import { usePlanFormLayout } from '@/features/plans/components/PlanFormLayout'
import { CUSTOM_TYPE_VALUE } from '@/components/TypeSelectorRow'

type Props = {
  title: string
  setTitle: (title: string) => void
  /** Omitted when this binary has no place search. */
  location?: {
    value?: PlanLocation
    onChange: (location?: PlanLocation) => void
  }
  note: string
  setNote: (note: string) => void
  /** Omitted when there's no confirmed buddy to invite. */
  buddies?: { picker: ReactNode; summary?: string }
  /** Omitted for recurring plans, which don't have reminders. */
  notifyMe?: {
    on: boolean
    onToggle: (on: boolean) => void
    /** Explains a switch that's off because notifications aren't allowed. */
    description?: string
    offset: ReactNode
    notice?: ReactNode
  }
  /** Only for recurring plans. */
  end?: {
    willEnd: boolean
    onToggle: () => void
    endDate: Date | null
    setEndDate: (date: Date) => void
  }
  type: {
    value: string
    onChange: (selection: TypeSelection) => void
    /** Shown under the Type row, e.g. why Save is disabled. */
    hint?: string
  }
}

const NOTE_MAX_HEIGHT = 184

const TitleRow = (props: {
  title: string
  setTitle: (title: string) => void
}) => {
  const theme = useTheme()
  const layout = usePlanFormLayout()
  return (
    <PlanFormRow icon={TypeIcon} first>
      <TextInput
        value={props.title}
        onChangeText={props.setTitle}
        onFocus={() => layout.fieldFocused()}
        placeholder={i18n.t('planTitle_placeholder')}
        placeholderTextColor={theme.colors.textAlt}
        accessibilityLabel={i18n.t('planTitle')}
        testID='plan-title-input'
        maxLength={100}
        textAlign='left'
        returnKeyType='done'
        clearButtonMode='while-editing'
        style={planRowInputStyle}
      />
    </PlanFormRow>
  )
}

const LocationSearch = (props: {
  onSelect: (location: PlanLocation) => void
}) => {
  const layout = usePlanFormLayout()
  const [query, setQuery] = useState('')

  return (
    <View style={{ paddingVertical: 4 }}>
      <PlaceSearchInput
        scope='all'
        borderless
        query={query}
        onChangeQuery={setQuery}
        onSelect={(selected) => {
          // Picking a place swaps this field out without a blur event.
          layout.fieldBlurred()
          props.onSelect(toPlanLocation(selected))
          setQuery('')
        }}
        // Suggestions open under the field, so keep it near the top.
        onFocus={() => layout.fieldFocused({ pinToTop: true })}
        onBlur={layout.fieldBlurred}
        placeholder={i18n.t('planLocation_placeholder')}
        accessibilityLabel={i18n.t('location')}
      />
    </View>
  )
}

const LocationRow = (props: NonNullable<Props['location']>) => {
  const theme = useTheme()
  const place = props.value ? formatPlanLocation(props.value) : undefined

  if (place?.primary) {
    return (
      <PlanFormRow
        icon={MapPinIcon}
        trailing={
          <Button
            noTransform
            onPress={() => props.onChange(undefined)}
            accessibilityRole='button'
            accessibilityLabel={i18n.t('planLocation_clear')}
            style={{
              width: 44,
              height: 44,
              marginRight: -10,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LucideIcon icon={XIcon} size={18} color={theme.colors.textAlt} />
          </Button>
        }
      >
        <View style={{ paddingVertical: 8, gap: 2 }}>
          <Text numberOfLines={2} style={{ fontFamily: theme.fonts.semiBold }}>
            {place.primary}
          </Text>
          {place.secondary && (
            <Text
              numberOfLines={2}
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {place.secondary}
            </Text>
          )}
        </View>
      </PlanFormRow>
    )
  }

  return (
    <PlanFormRow icon={MapPinIcon}>
      <LocationSearch onSelect={props.onChange} />
    </PlanFormRow>
  )
}

const NoteRow = (props: { note: string; setNote: (note: string) => void }) => {
  const theme = useTheme()
  const layout = usePlanFormLayout()
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const input = useRef<InputRef>(null)
  // Opening the row is how the note gets added, so the cursor goes in it.
  // Focusing waits for the field's first layout: Android drops the keyboard
  // request for a field that isn't attached yet.
  const focusOnLayout = useRef(false)

  if (open) {
    return (
      <PlanFormRow
        icon={NotebookPenIcon}
        trailing={
          // Return adds a line in a note, and a full keyboard covers the
          // dock, so Done is the way out while typing.
          focused ? (
            <Button
              noTransform
              onPress={() => {
                Keyboard.dismiss()
                if (!props.note) setOpen(false)
              }}
              accessibilityRole='button'
              // Set explicitly: Android otherwise keeps the label of the Note
              // button this one replaces.
              accessibilityLabel={i18n.t('done')}
              testID='plan-note-done'
              style={{
                height: PLAN_ROW_MIN_HEIGHT,
                paddingHorizontal: PLAN_ROW_PADDING_X,
                marginRight: -PLAN_ROW_PADDING_X,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('done')}
              </Text>
            </Button>
          ) : (
            <Button
              noTransform
              onPress={() => setOpen(false)}
              accessibilityRole='button'
              accessibilityLabel={i18n.t('note')}
              accessibilityState={{ expanded: true }}
              style={{
                width: 44,
                height: PLAN_ROW_MIN_HEIGHT,
                marginRight: -PLAN_ROW_PADDING_X,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PlanFormChevron open />
            </Button>
          )
        }
      >
        <TextInput
          ref={input}
          multiline
          value={props.note}
          onChangeText={props.setNote}
          onFocus={() => {
            setFocused(true)
            layout.fieldFocused()
          }}
          onBlur={() => setFocused(false)}
          onLayout={() => {
            if (!focusOnLayout.current) return
            focusOnLayout.current = false
            requestAnimationFrame(() => input.current?.focus())
          }}
          placeholder={i18n.t('optional')}
          placeholderTextColor={theme.colors.textAlt}
          accessibilityLabel={i18n.t('note')}
          testID='plan-note-input'
          textAlign='left'
          textAlignVertical='top'
          // Past a few lines the note scrolls inside itself, which keeps the
          // caret in view; a field taller than the space above the keyboard
          // can't be.
          style={{
            ...planRowInputStyle,
            minHeight: 88,
            maxHeight: NOTE_MAX_HEIGHT,
            paddingVertical: 14,
          }}
        />
      </PlanFormRow>
    )
  }

  return (
    <PlanFormRow
      icon={NotebookPenIcon}
      onPress={() => {
        focusOnLayout.current = true
        setOpen(true)
      }}
      accessibilityLabel={i18n.t('note')}
      accessibilityExpanded={false}
      testID='plan-note-row'
      trailing={
        props.note ? <PlanFormChevron open={false} /> : <PlanFormAddBadge />
      }
    >
      {props.note ? (
        <Text numberOfLines={2} style={{ paddingVertical: 8 }}>
          {props.note}
        </Text>
      ) : (
        <PlanFormRowLabel>{i18n.t('note')}</PlanFormRowLabel>
      )}
    </PlanFormRow>
  )
}

const BuddiesRow = (props: NonNullable<Props['buddies']>) => {
  const layout = usePlanFormLayout()
  const row = useRef<View>(null)
  const [open, setOpen] = useState(false)
  return (
    <PlanFormRow
      icon={UsersIcon}
      containerRef={row}
      onPress={() => {
        if (!open) layout.revealAfterLayout(row)
        setOpen(!open)
      }}
      accessibilityLabel={i18n.t('buddies_inviteBuddies')}
      accessibilityExpanded={open}
      testID='plan-buddies-row'
      trailing={
        <>
          {!open && <PlanFormRowValue>{props.summary}</PlanFormRowValue>}
          {props.summary || open ? (
            <PlanFormChevron open={open} />
          ) : (
            <PlanFormAddBadge />
          )}
        </>
      }
      expanded={open && props.picker}
    >
      <PlanFormRowLabel>{i18n.t('buddies_inviteBuddies')}</PlanFormRowLabel>
    </PlanFormRow>
  )
}

const NotifyMeRow = (props: NonNullable<Props['notifyMe']>) => {
  const theme = useTheme()
  const layout = usePlanFormLayout()
  const row = useRef<View>(null)
  return (
    <PlanFormRow
      icon={BellIcon}
      containerRef={row}
      trailing={
        // The native switch draws above its frame when centered in a taller
        // row; giving it the row's height keeps it level with the label.
        <View style={{ height: PLAN_ROW_MIN_HEIGHT, justifyContent: 'center' }}>
          <Switch
            accessibilityLabel={i18n.t('notifyMe')}
            value={props.on}
            onValueChange={(on) => {
              if (on) layout.revealAfterLayout(row)
              props.onToggle(on)
            }}
          />
        </View>
      }
      expanded={
        props.on && (
          <View style={{ gap: 6 }}>
            {props.offset}
            {props.notice}
          </View>
        )
      }
    >
      <PlanFormRowLabel>{i18n.t('notifyMe')}</PlanFormRowLabel>
      {props.description && (
        <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
          {props.description}
        </Text>
      )}
    </PlanFormRow>
  )
}

const EndDateRow = (props: NonNullable<Props['end']>) => (
  <PlanFormRow
    icon={FlagIcon}
    trailing={
      // The native picker's popover leaves the field focused; without this
      // the keyboard comes back for it once the popover closes.
      <View
        onTouchStart={() => Keyboard.dismiss()}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        {props.willEnd && props.endDate && (
          <DateTimePicker
            value={props.endDate}
            onChange={(_, next) => next && props.setEndDate(next)}
          />
        )}
        <View style={{ height: PLAN_ROW_MIN_HEIGHT, justifyContent: 'center' }}>
          <Switch
            accessibilityLabel={i18n.t('endDate')}
            value={props.willEnd}
            onValueChange={props.onToggle}
          />
        </View>
      </View>
    }
  >
    <PlanFormRowLabel>{i18n.t('endDate')}</PlanFormRowLabel>
  </PlanFormRow>
)

/**
 * The optional half of the Plan form. Each row behaves like its data: Title and
 * Type edit in place, Location searches in place, and Note, Invite Buddies and
 * Notify Me open under their row.
 */
const PlanDetailsList = (props: Props) => {
  const theme = useTheme()
  const layout = usePlanFormLayout()
  const typeRow = useRef<View>(null)
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingHorizontal: 4,
        }}
      >
        {i18n.t('planForm_details')}
      </Text>
      <Section>
        <TitleRow title={props.title} setTitle={props.setTitle} />
        {props.location && <LocationRow {...props.location} />}
        <NoteRow note={props.note} setNote={props.setNote} />
        {props.buddies && <BuddiesRow {...props.buddies} />}
        {props.notifyMe && <NotifyMeRow {...props.notifyMe} />}
        {props.end && <EndDateRow {...props.end} />}
        <View
          ref={typeRow}
          style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}
        >
          <TypeSelectorRow
            value={props.type.value}
            onChange={(selection) => {
              // Custom adds a name field under the row.
              if (selection.value === CUSTOM_TYPE_VALUE) {
                layout.revealAfterLayout(typeRow)
              }
              props.type.onChange(selection)
            }}
            leftIcon={TagIcon}
            // Keep the hint under the name field in view while typing too.
            onCustomNameFocus={() =>
              layout.fieldFocused({ container: typeRow })
            }
            lastInSection
            style={{
              minHeight: PLAN_ROW_MIN_HEIGHT,
              paddingTop: 6,
              paddingBottom: 6,
              paddingLeft: PLAN_ROW_PADDING_X,
              paddingRight: PLAN_ROW_PADDING_X,
            }}
          />
          {props.type.hint && (
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: 12,
                paddingHorizontal: PLAN_ROW_PADDING_X,
                paddingBottom: 12,
              }}
            >
              {props.type.hint}
            </Text>
          )}
        </View>
      </Section>
    </View>
  )
}

export default PlanDetailsList
