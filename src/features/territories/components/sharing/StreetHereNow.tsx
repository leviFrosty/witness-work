import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useNow from '@/hooks/useNow'
import i18n from '@/lib/locales'
import { joinNames, personName } from '@/features/territories/lib/shareText'
import { workingNow } from '@/features/territories/lib/sharing'
import type {
  TerritoryPerson,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export default function StreetHereNow({
  street,
  people,
}: {
  street: TerritoryStreet
  people?: TerritoryPerson[]
}) {
  const theme = useTheme()
  const { now } = useNow()
  const ids = workingNow(street, Math.max(now, Date.now()))
  if (ids.length === 0) return null
  const names = ids.map((id) => personName({ people }, id))
  return (
    <Text
      testID={`street-here-now-${street.id}`}
      style={{
        fontSize: theme.fontSize('xs'),
        color: theme.colors.textAlt,
      }}
    >
      {i18n.t('territories.share.recordedJustNow', {
        names: joinNames(names),
      })}
    </Text>
  )
}
