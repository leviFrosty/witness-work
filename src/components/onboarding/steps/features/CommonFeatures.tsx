import {
  faBell,
  faBolt,
  faChartSimple,
  faCode,
  faFileImport,
  faIdCard,
  faLanguage,
  faMapLocationDot,
} from '@fortawesome/free-solid-svg-icons'
import FeatureCard from './FeatureCard'

export default function CommonFeatures() {
  return (
    <>
      <FeatureCard icon={faIdCard} title='contacts' text='features.contact' />
      <FeatureCard
        icon={faMapLocationDot}
        title='contact_pins'
        text='features.pins'
      />
      <FeatureCard
        icon={faChartSimple}
        title='monthlyRoutine'
        text='features.monthlyRoutine'
      />
      <FeatureCard icon={faBolt} title='autofill' text='features.autofill' />
      <FeatureCard
        icon={faFileImport}
        title='backupAndRestore'
        text='features.backup'
      />
      <FeatureCard
        icon={faLanguage}
        title='translated'
        text='features.translated'
      />
      <FeatureCard icon={faCode} title='freeUpdates' text='features.updates' />
      <FeatureCard icon={faBell} title='reminders' text='features.reminders' />
    </>
  )
}
