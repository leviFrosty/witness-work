type LaunchAddress = {
  returnedAppUserId: string | null

  forwardedReturn: boolean

  devCountry: string | null

  devBuyGate: boolean
}

let launch: LaunchAddress = {
  returnedAppUserId: null,
  forwardedReturn: false,
  devCountry: null,
  devBuyGate: false,
}

export const setLaunchAddress = (value: LaunchAddress) => {
  launch = { ...value }
}

export const returnedAppUserId = (): string | null => launch.returnedAppUserId

export const forwardedReturn = (): boolean => launch.forwardedReturn

export const devCountryOverride = (): string | null => launch.devCountry

export const devBuyGateOverride = (): boolean => launch.devBuyGate
