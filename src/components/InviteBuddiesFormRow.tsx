import { ReactNode, useRef, useState } from 'react'
import { View } from 'react-native'
import { Users as UsersIcon } from 'lucide-react-native'
import Text from '@/components/ui/MyText'
import FormRow, {
  FormRowAddBadge,
  FormRowChevron,
  FormRowLabel,
  FormRowValue,
} from '@/components/ui/inputs/FormRow'
import { useDockedFormLayout } from '@/components/ui/layout/DockedFormLayout'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/** What the row offers: the buddy chips, or a way to set invitations up. */
export type InviteBuddiesRowContent = {
  /** A line under the buddies once the row opens, or under its label. */
  description?: string
} & (
  | {
      /** The buddy chips, opened under the row. */
      picker: ReactNode
      /** Who's invited, shown while the row is closed. */
      summary?: string
    }
  | {
      /** Takes the User where invitations start, e.g. to pair a buddy. */
      setUp: () => void
    }
)

type Props = InviteBuddiesRowContent & {
  /** The row's testID, e.g. `plan-buddies-row`. */
  testID: string
}

/**
 * A details list's Invite Buddies row. It opens to the buddy chips and names
 * who's invited while closed; before invitations can go out, it's a "+" row
 * that sets them up.
 */
export default function InviteBuddiesFormRow(props: Props) {
  if ('setUp' in props) {
    return (
      <FormRow
        icon={UsersIcon}
        onPress={props.setUp}
        accessibilityLabel={i18n.t('buddies_inviteBuddies')}
        testID={props.testID}
        trailing={<FormRowAddBadge />}
      >
        <View style={props.description ? { paddingVertical: 8, gap: 2 } : null}>
          <FormRowLabel>{i18n.t('buddies_inviteBuddies')}</FormRowLabel>
          <Description>{props.description}</Description>
        </View>
      </FormRow>
    )
  }
  return <PickerRow {...props} />
}

function PickerRow(props: {
  testID: string
  description?: string
  picker: ReactNode
  summary?: string
}) {
  const layout = useDockedFormLayout()
  const row = useRef<View>(null)
  const [open, setOpen] = useState(false)
  return (
    <FormRow
      icon={UsersIcon}
      containerRef={row}
      onPress={() => {
        if (!open) layout.revealAfterLayout(row)
        setOpen(!open)
      }}
      accessibilityLabel={i18n.t('buddies_inviteBuddies')}
      accessibilityExpanded={open}
      testID={props.testID}
      trailing={
        props.summary || open ? (
          <FormRowChevron open={open} />
        ) : (
          <FormRowAddBadge />
        )
      }
      expanded={
        open && (
          <View style={{ gap: 8 }}>
            {props.picker}
            <Description>{props.description}</Description>
          </View>
        )
      }
    >
      {/* The names take the room the label leaves. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexShrink: 1 }}>
          <FormRowLabel>{i18n.t('buddies_inviteBuddies')}</FormRowLabel>
        </View>
        {!open && <FormRowValue>{props.summary}</FormRowValue>}
      </View>
    </FormRow>
  )
}

function Description({ children }: { children?: string }) {
  const theme = useTheme()
  if (!children) return null
  return (
    <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
      {children}
    </Text>
  )
}
