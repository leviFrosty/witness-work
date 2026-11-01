import i18n from '@/lib/locales'
import type { CarPerson } from '@/lib/mileage/people'

type Named = Pick<CarPerson, 'me' | 'name'>

export const personLabel = (person: Named): string =>
  person.me ? i18n.t('mileage.you') : person.name || i18n.t('mileage.someone')

export const personExportName = (person: Named, ownName = ''): string =>
  person.me
    ? ownName || i18n.t('mileage.me')
    : person.name || i18n.t('mileage.someone')

export function personFilterLabels(
  others: readonly CarPerson[],
  carName: (spaceId: string) => string | undefined
): Map<string, string> {
  const name = (person: CarPerson) => person.name || i18n.t('mileage.someone')
  const counts = new Map<string, number>()
  for (const person of others)
    counts.set(name(person), (counts.get(name(person)) ?? 0) + 1)
  return new Map(
    others.map((person) => {
      const car = carName(person.spaceId)
      const repeated = (counts.get(name(person)) ?? 0) > 1
      return [
        person.key,
        repeated && !person.buddy && car
          ? i18n.t('mileage.personOnCar', { name: name(person), car })
          : name(person),
      ]
    })
  )
}
