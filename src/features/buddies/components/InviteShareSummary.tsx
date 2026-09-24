import { View } from 'react-native'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/** What each side of a pairing sees — and what never leaves either phone. */
export default function InviteShareSummary({
  inviterName,
}: {
  inviterName: string
}) {
  const theme = useTheme()
  const rows = [
    {
      title: i18n.t('buddies_inviteTheyWillSee', { name: inviterName }),
      body: i18n.t('buddies_invitePlansLine'),
    },
    {
      title: i18n.t('buddies_inviteYouWillSee'),
      body: i18n.t('buddies_inviteTheirPlansLine', { name: inviterName }),
    },
    {
      title: i18n.t('buddies_inviteNeverShared'),
      body: i18n.t('buddies_inviteNeverSharedLine'),
    },
  ]

  return (
    <Card style={{ gap: 14 }}>
      {rows.map((row) => (
        <View key={row.title} style={{ gap: 2 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>{row.title}</Text>
          <Text style={{ color: theme.colors.textAlt }}>{row.body}</Text>
        </View>
      ))}
    </Card>
  )
}
