import { useContext } from 'react'
import { AnimationViewContext } from '../contexts/AnimationView'

const useAnimation = () => {
  const context = useContext(AnimationViewContext)

  if (!context) {
    throw new Error('useAnimation must be used within a AnimationViewProvider')
  }

  return context
}

export default useAnimation
