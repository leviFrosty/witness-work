import * as Device from 'expo-device'
import Constants from 'expo-constants'

const useDevice = () => {
  const isTablet = Device.deviceType === Device.DeviceType.TABLET
  const isExpoGo = Constants.appOwnership === 'expo'

  return {
    isTablet,
    isExpoGo,
    ...Device,
  }
}

export default useDevice
