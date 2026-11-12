export const territoryPrivacyOn = (preferences: {
  territoryPrivacyMode: boolean | null
  dataProtectionMode: boolean
}) => preferences.territoryPrivacyMode ?? preferences.dataProtectionMode
