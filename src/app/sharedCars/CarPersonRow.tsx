import { ActivityIndicator, View } from 'react-native'
import Avatar from '@/components/ui/Avatar'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import PullDownMenu from '@/components/ui/PullDownMenu'
import XView from '@/components/ui/layout/XView'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import type { ContextMenuAction } from '@/components/ui/ContextMenu.types'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { ProfileAvatar } from '@/types/avatar'

/** The row's action button: its ellipsis, framed to the full target. */
const ACTIONS_GLYPH = 20

/**
 * One person on a Shared Car, or an open invitation, in the car form's People
 * section: their photo, name, and a line under it ("Owner", "Invited · Expires
 * Nov 5"). What the User can do about them sits in a menu at the end; a spinner
 * takes its place while it runs. A screen reader reads the person as one stop
 * ("Ana, Owner"), and their menu as the next.
 */
export default function CarPersonRow({
  name,
  avatar,
  color,
  subtitle,
  actions,
  busy,
  last,
}: {
  /** As shown: "You" for the User. */
  name: string
  avatar: ProfileAvatar
  color?: string
  subtitle?: string
  actions: ContextMenuAction[]
  busy?: boolean
  last: boolean
}) {
  const theme = useTheme()
  const label = i18n.t('mileage.personActions', { name })

  return (
    <XView
      style={{
        gap: 12,
        minHeight: 56,
        paddingVertical: 10,
        paddingLeft: 15,
        paddingRight: 15,
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.colors.border,
      }}
    >
      <XView
        accessible
        accessibilityLabel={[name, subtitle].filter(Boolean).join(', ')}
        style={{ flex: 1, gap: 12 }}
      >
        <Avatar avatar={avatar} name={name} background={color} size={32} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1}>{name}</Text>
          {subtitle ? (
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </XView>
      {busy ? (
        <View style={touchTargetFrame(ACTIONS_GLYPH)}>
          <ActivityIndicator
            size='small'
            color={theme.colors.textAlt}
            accessibilityLabel={i18n.t('common_loading')}
          />
        </View>
      ) : actions.length > 0 ? (
        <PointerTooltip label={label} effect='none'>
          <PullDownMenu
            accessibilityLabel={label}
            actions={actions}
            triggerSize={ACTIONS_GLYPH}
          />
        </PointerTooltip>
      ) : null}
    </XView>
  )
}
