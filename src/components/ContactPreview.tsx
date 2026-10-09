import { View } from 'react-native'

import Avatar from '@/components/ui/Avatar'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { addressToString } from '@/lib/address'
import { formatDate, formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import RichNote from '@/components/RichNote'
import { hasNote } from '@/lib/richText/notes'

type ContactPreviewProps = {
  contact: Contact
  /** The contact's most recent visit, from the caller's conversation index. */
  lastVisit?: Visit | null
}

/**
 * Context menu preview for a Contact: who, where, and where things stand, so
 * people can confirm the person before acting.
 */
export default function ContactPreview({
  contact,
  lastVisit,
}: ContactPreviewProps) {
  const theme = useTheme()
  const address = addressToString(contact.address)
  const followUp =
    lastVisit?.followUp && !lastVisit.followUp.dismissed
      ? lastVisit.followUp
      : null

  const label = {
    fontSize: theme.fontSize('xs'),
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textAlt,
    textTransform: 'uppercase' as const,
  }

  return (
    <View
      style={{
        width: 300,
        padding: 16,
        gap: 12,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar
          avatar={contact.avatar ?? { type: 'none', value: '' }}
          name={contact.name}
          size={44}
          background={contact.avatarBackground ?? undefined}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={2}
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.bold,
            }}
          >
            {contact.name}
          </Text>
          {address ? (
            <Text
              numberOfLines={2}
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {address}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={label}>{i18n.t('recentConversation')}</Text>
        <Text style={{ fontSize: theme.fontSize('sm') }}>
          {lastVisit
            ? `${formatDate(lastVisit.date, { style: 'medium' })} · ${formatRelative(lastVisit.date)}`
            : i18n.t('noConversationYet')}
        </Text>
        {lastVisit && hasNote(lastVisit) ? (
          <RichNote
            note={lastVisit}
            numberOfLines={4}
            interactive={false}
            linkCards={false}
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          />
        ) : null}
      </View>
      {followUp ? (
        <View style={{ gap: 4 }}>
          <Text style={label}>{i18n.t('followUp')}</Text>
          <Text style={{ fontSize: theme.fontSize('sm') }}>
            {formatDate(followUp.date, { style: 'medium' })}
            {followUp.topic ? ` · ${followUp.topic}` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  )
}
