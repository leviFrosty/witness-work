import * as Device from 'expo-device'

const useDevice = () => {
  const isTablet = Device.deviceType === Device.DeviceType.TABLET

  return {
    isTablet,
    ...Device,
  }
}

export default useDevice
