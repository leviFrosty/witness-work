import { useContext } from 'react'
import { ConfettiContext } from '@/contexts/Confetti'

const useFireworks = () => {
  const context = useContext(ConfettiContext)

  if (!context) {
    throw new Error('useFireworks must be used within a ConfettiProvider')
  }

  return context
}

export default useFireworks
