import { ReactNode, useRef, useState } from 'react'
import { Keyboard, View } from 'react-native'
import {
  Bell as BellIcon,
  Flag as FlagIcon,
  MapPin as MapPinIcon,
  Type as TypeIcon,
  X as XIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import DateTimePicker from '@/components/ui/DateTimePicker'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Switch from '@/components/ui/Switch'
import TextInput from '@/components/ui/TextInput'
import FormDetailsSection from '@/components/ui/inputs/FormDetailsSection'
import FormRow, {
  FORM_ROW_MIN_HEIGHT,
  FormRowLabel,
  formRowInputStyle,
} from '@/components/ui/inputs/FormRow'
import NoteFormRow from '@/components/ui/inputs/NoteFormRow'
import { useDockedFormLayout } from '@/components/ui/layout/DockedFormLayout'
import InviteBuddiesFormRow, {
  type InviteBuddiesRowContent,
} from '@/components/InviteBuddiesFormRow'
import PlaceSearchInput from '@/components/PlaceSearchInput'
import TypeFormRow from '@/components/TypeFormRow'
import { type TypeSelection } from '@/components/TypeSelectorRow'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatPlanLocation, toPlanLocation } from '@/lib/placeSearch'
import type { NoteUpdate } from '@/lib/richText/notes'
import type { NoteFields } from '@/types/richText'
import type { PlanLocation } from '@/types/timeEntry'

type Props = {
  organizerFields?: 'editable' | 'hidden'
  title: string
  setTitle: (title: string) => void

  location?: {
    value?: PlanLocation
    onChange: (location?: PlanLocation) => void
  }
  note: NoteFields
  setNote: (note: NoteUpdate) => void

  buddies?: InviteBuddiesRowContent
  notifyMe?: {
    on: boolean
    onToggle: (on: boolean) => void

    description?: string
    offset: ReactNode
    notice?: ReactNode
  }

  end?: {
    willEnd: boolean
    onToggle: () => void
    endDate: Date | null
    setEndDate: (date: Date) => void
  }
  type: {
    value: string
    onChange: (selection: TypeSelection) => void

    invalid?: boolean
    hint?: string
  }
}

const TitleRow = (props: {
  title: string
  setTitle: (title: string) => void
}) => {
  const theme = useTheme()
  const layout = useDockedFormLayout()
  return (
    <FormRow icon={TypeIcon} first>
      <TextInput
        value={props.title}
        onChangeText={props.setTitle}
        onFocus={() => layout.fieldFocused()}
        placeholder={i18n.t('planTitle_placeholder')}
        placeholderTextColor={theme.colors.textAlt}
        accessibilityLabel={i18n.t('planTitle')}
        testID='plan-title-input'
        maxLength={100}
        textAlign='start'
        returnKeyType='done'
        clearButtonMode='while-editing'
        style={formRowInputStyle}
      />
    </FormRow>
  )
}

const LocationSearch = (props: {
  onSelect: (location: PlanLocation) => void
}) => {
  const layout = useDockedFormLayout()
  const [query, setQuery] = useState('')

  return (
    <View style={{ paddingVertical: 4 }}>
      <PlaceSearchInput
        scope='all'
        borderless
        query={query}
        onChangeQuery={setQuery}
        onSelect={(selected) => {
          layout.fieldBlurred()
          props.onSelect(toPlanLocation(selected))
          setQuery('')
        }}
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
      <FormRow
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
      </FormRow>
    )
  }

  return (
    <FormRow icon={MapPinIcon}>
      <LocationSearch onSelect={props.onChange} />
    </FormRow>
  )
}

const NotifyMeRow = (
  props: NonNullable<Props['notifyMe']> & { first?: boolean }
) => {
  const theme = useTheme()
  const layout = useDockedFormLayout()
  const row = useRef<View>(null)
  return (
    <FormRow
      icon={BellIcon}
      containerRef={row}
      first={props.first}
      trailing={
        <View style={{ height: FORM_ROW_MIN_HEIGHT, justifyContent: 'center' }}>
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
      <FormRowLabel>{i18n.t('notifyMe')}</FormRowLabel>
      {props.description && (
        <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
          {props.description}
        </Text>
      )}
    </FormRow>
  )
}

const EndDateRow = (props: NonNullable<Props['end']>) => (
  <FormRow
    icon={FlagIcon}
    trailing={
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
        <View style={{ height: FORM_ROW_MIN_HEIGHT, justifyContent: 'center' }}>
          <Switch
            accessibilityLabel={i18n.t('endDate')}
            value={props.willEnd}
            onValueChange={props.onToggle}
          />
        </View>
      </View>
    }
  >
    <FormRowLabel>{i18n.t('endDate')}</FormRowLabel>
  </FormRow>
)

const PlanDetailsList = (props: Props) => {
  const organizer = props.organizerFields !== 'hidden'
  return (
    <FormDetailsSection>
      {organizer && <TitleRow title={props.title} setTitle={props.setTitle} />}
      {organizer && props.location && <LocationRow {...props.location} />}
      {organizer && (
        <NoteFormRow
          note={props.note}
          onChange={props.setNote}
          surface='plan'
          testID='plan-note'
        />
      )}
      {props.buddies && (
        <InviteBuddiesFormRow {...props.buddies} testID='plan-buddies-row' />
      )}
      {props.notifyMe && (
        <NotifyMeRow {...props.notifyMe} first={!organizer && !props.buddies} />
      )}
      {props.end && <EndDateRow {...props.end} />}
      <TypeFormRow {...props.type} />
    </FormDetailsSection>
  )
}

export default PlanDetailsList
