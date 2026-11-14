import { canReadMytimeDb } from '@/features/mytime-import/lib/readMytimeDb'
import { useScribeAvailability } from '@/features/scribe'

export default function useImportAvailable(): boolean {
  const scribe = useScribeAvailability()
  return canReadMytimeDb || scribe.status !== 'hidden'
}
