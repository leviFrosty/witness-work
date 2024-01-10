import * as Device from 'expo-device'
import { Platform } from 'react-native'

const useDevice = () => {
  const isTablet = Device.deviceType === Device.DeviceType.TABLET
  const isAndroid = Platform.OS === 'android'

  return {
    isTablet,
    isAndroid,
    ...Device,
  }
}

export default useDevice
