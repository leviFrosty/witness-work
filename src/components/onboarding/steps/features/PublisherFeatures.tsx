import { faCheck } from '@fortawesome/free-solid-svg-icons'
import FeatureCard from './FeatureCard'

export default function PublisherFeatures() {
  return (
    <>
      <FeatureCard
        selected
        icon={faCheck}
        title='check'
        text='features.check'
      />
    </>
  )
}
