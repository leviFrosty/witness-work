import apis from '@/constants/apis'
import { approvalOriginsFor } from '@/lib/serverAccount/approval'

export const appApprovalOrigins = () =>
  approvalOriginsFor({ apiBaseUrl: apis.accounts, dev: __DEV__ })
