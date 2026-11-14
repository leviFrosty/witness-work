import { forBuild } from '@/constants/buildVariant'

export const PASSKEY_RP_ID = forBuild({
  development: 'beta.app.witnesswork.app',
  beta: 'beta.app.witnesswork.app',
  production: 'app.witnesswork.app',
})
