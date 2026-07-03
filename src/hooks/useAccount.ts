import { useContext } from 'react'
import { AccountContext } from '@/contexts/account'

const useAccount = () => {
  const context = useContext(AccountContext)

  if (!context) {
    throw new Error('useAccount must be used within an AccountProvider')
  }

  return context
}

export default useAccount
