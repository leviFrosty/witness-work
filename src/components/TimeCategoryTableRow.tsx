import { View } from 'react-native'
import Text from './MyText'
import XView from './layout/XView'
import CreditBadge from './CreditBadge'
import { useFormattedMinutes } from '../lib/minutes'

const TimeCategoryTableRow = ({
  title,
  number,
  credit,
}: {
  title: string
  number: number
  credit?: boolean
}) => {
  const minutesWithFormat = useFormattedMinutes(number)
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
      }}
    >
      <XView>
        <Text>{title}</Text>
        {credit && <CreditBadge />}
      </XView>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        <Text>{minutesWithFormat.formatted}</Text>
      </View>
    </View>
  )
}

export default TimeCategoryTableRow
