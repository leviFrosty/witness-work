import i18n from '@/lib/locales'
import type { CarPerson } from '@/lib/mileage/people'

type Named = Pick<CarPerson, 'me' | 'name'>

/** A person on a Shared Car as the app shows them: "You" for the User. */
export const personLabel = (person: Named): string =>
  person.me ? i18n.t('mileage.you') : person.name || i18n.t('mileage.someone')

/**
 * A person as a report or export names them, for whoever reads it: the User by
 * their own name (`ownName`), else "Me"; anyone else by the name they share on
 * the car. A report works out `ownName` once, so every trip of the User's reads
 * the same.
 */
export const personExportName = (person: Named, ownName = ''): string =>
  person.me
    ? ownName || i18n.t('mileage.me')
    : person.name || i18n.t('mileage.someone')

/**
 * The person filter's label for each of `others`, by key: their name, with
 * their car's when someone else has the same name. Only a buddy is known as one
 * person across cars; anyone else is a person per car, so someone on two of the
 * User's cars who isn't their buddy is listed once for each, by car.
 */
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
