import type { ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'

import GenderIcon from '@/components/GenderIcon'
import Avatar from '@/components/ui/Avatar'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import WholeWordsText from '@/components/ui/WholeWordsText'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import type { Contact } from '@/types/contact'

/**
 * The card every Contact list item sits on: the Contacts list's rounded card
 * with its staleness stripe down the left edge. Put a {@link ContactCardBody}
 * inside it, alone or beside buttons that act on the Contact.
 */
export default function ContactCard({
  stripeColor,
  selected = false,
  style,
  children,
  ...props
}: ViewProps & {
  /** The Contact's staleness color; see `useContactStalenessColor`. */
  stripeColor?: string
  /** Tints the card, for the selected row of a split view or Select mode. */
  selected?: boolean
}) {
  const theme = useTheme()

  return (
    <Card
      {...props}
      style={[
        {
          paddingHorizontal: 18,
          paddingVertical: 16,
          borderRadius: theme.numbers.borderRadiusSm,
          backgroundColor: selected
            ? theme.colors.accentTranslucent
            : theme.colors.backgroundLighter,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {stripeColor ? (
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            backgroundColor: stripeColor,
          }}
        />
      ) : null}
      {children}
    </Card>
  )
}

/**
 * A Contact's avatar, name, and gender, with a one-line `subtitle` under the
 * name. `leading` sits before the avatar (e.g. a Select mode check) and
 * `trailing` after the text (badges, a chevron).
 */
export function ContactCardBody({
  contact,
  name,
  subtitle,
  leading,
  trailing,
}: {
  contact: Contact
  /** Replaces the plain name, e.g. with a search highlight. */
  name?: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
}) {
  const largeText = useAccessibilityTextSize()
  // A long name at accessibility sizes shrinks rather than breaking mid-word.
  const Name = largeText ? WholeWordsText : Text
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
      {leading}
      <Avatar
        avatar={contact.avatar ?? { type: 'none', value: '' }}
        name={contact.name}
        size={36}
        background={contact.avatarBackground ?? undefined}
      />
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flexShrink: 1 }}>
            {name ?? (
              <Name
                style={{ fontSize: 18 }}
                numberOfLines={largeText ? undefined : 1}
              >
                {contact.name}
              </Name>
            )}
          </View>
          {contact.gender && (
            <GenderIcon gender={contact.gender} size={10} opacity={0.6} />
          )}
        </View>
        {subtitle}
      </View>
      {trailing}
    </View>
  )
}

/** The small grey line under a Contact's name, with an optional icon. */
export function ContactCardSubtitle({
  icon,
  color,
  children,
}: {
  icon?: ReactNode
  color?: string
  children: ReactNode
}) {
  const theme = useTheme()
  // At accessibility sizes it wraps rather than cutting off after a word.
  const largeText = useAccessibilityTextSize()
  const text = (
    <Text
      style={{
        color: color ?? theme.colors.textAlt,
        fontSize: icon ? 11 : 10,
        flexShrink: 1,
      }}
      numberOfLines={largeText ? undefined : 1}
    >
      {children}
    </Text>
  )
  if (!icon) return text
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon}
      {text}
    </View>
  )
}
