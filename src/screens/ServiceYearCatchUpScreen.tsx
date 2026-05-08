import { useNavigation } from '@react-navigation/native'
import { View } from 'react-native'

import Wrapper from '../components/layout/Wrapper'
import ServiceYearCatchUpForm from '../components/ServiceYearCatchUpForm'
import { RootStackNavigation } from '../types/rootStack'

const ServiceYearCatchUpScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()

  const handleClose = () => {
    if (navigation.canGoBack()) {
      navigation.goBack()
    }
  }

  return (
    <Wrapper
      insets='both'
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 20,
      }}
    >
      <View style={{ flex: 1 }}>
        <ServiceYearCatchUpForm
          onComplete={handleClose}
          onSkip={handleClose}
          setSkippedStatusOnSkip={false}
        />
      </View>
    </Wrapper>
  )
}

export default ServiceYearCatchUpScreen
