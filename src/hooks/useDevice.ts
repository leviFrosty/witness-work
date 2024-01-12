import * as Device from 'expo-device'
import { Platform } from 'react-native'
import Constants from 'expo-constants'

const useDevice = () => {
  const isTablet = Device.deviceType === Device.DeviceType.TABLET
  const isAndroid = Platform.OS === 'android'
  const isExpoGo = Constants.appOwnership === 'expo'

  return {
    isTablet,
    isAndroid,
    isExpoGo,
    ...Device,
  }
}

export default useDevice
