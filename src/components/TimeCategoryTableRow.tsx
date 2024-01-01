import { View } from 'react-native'
import Text from './MyText'

const TimeCategoryTableRow = ({
  title,
  number,
}: {
  title: string
  number: number
}) => {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
      }}
    >
      <Text>{title}</Text>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        <Text>{number}</Text>
      </View>
    </View>
  )
}

export default TimeCategoryTableRow
