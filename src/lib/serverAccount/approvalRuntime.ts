import apis from '@/constants/apis'
import { approvalOriginsFor } from '@/lib/serverAccount/approval'

/**
 * The web app origins this build accepts approval codes from: its API's, plus a
 * local web build's in a dev build that isn't on the production API.
 */
export const appApprovalOrigins = () =>
  approvalOriginsFor({ apiBaseUrl: apis.accounts, dev: __DEV__ })
