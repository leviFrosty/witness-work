/**
 * Five-star App Store reviews: excerpts quoted as written, with the store
 * nickname and storefront. Shown untranslated in every locale.
 */
export type Review = {
  title: string
  body: string
  author: string
  /** ISO country code of the App Store storefront. */
  store: string
  lang: string
}

export const REVIEWS: Review[] = [
  {
    title: 'Very user friendly',
    body: "My absolute favorite thing about this app is how everything I need is right there on a single page. It's incredibly simple to use, yet it covers all my bases for keeping track of my time, calls, and studies.",
    author: 'NathanC55',
    store: 'US',
    lang: 'en',
  },
  {
    title: 'Great app!',
    body: 'I love that you can see your calls on the map so you know which one is closer to you. It has so many great features! It’s just very complete and well made.',
    author: 'Pioneer 9',
    store: 'US',
    lang: 'en',
  },
  {
    title: 'Tried a BUNCH and it’s the best.',
    body: 'This is my favorite app of all service apps I tried. Some free some paid. This has the most logical organization and customization.',
    author: 'jswirly',
    store: 'US',
    lang: 'en',
  },
  {
    title: 'TREMENDA APLICACIÓN',
    body: 'Muy buena, útil y sencilla, fácil de aprender a usar!',
    author: '.ddddjyhajshajsjfd',
    store: 'US',
    lang: 'es',
  },
  {
    title: 'Best I’ve found',
    body: 'This app has every single feature I need without being clunky or overwhelming. It has a nice layout, and it’s very useful in the ministry.',
    author: 'heidelcedric',
    store: 'US',
    lang: 'en',
  },
  {
    title: 'Simple and Beautiful',
    body: 'It is straightforward and a joy to use.',
    author: 'Sparks1914',
    store: 'US',
    lang: 'en',
  },
  {
    title: 'Best ministry app',
    body: 'So easy and simple to use, especially for return visits.',
    author: 'Laurence246',
    store: 'CA',
    lang: 'en',
  },
  {
    title: 'Ідеальна програма',
    body: 'Дякую дуже! Все працює чудово',
    author: 'MKLviv',
    store: 'US',
    lang: 'uk',
  },
  {
    title: 'BEST UPDATE!',
    body: 'This app was great at first for finding my calls while in the ministry, now with the new features it can completely replace my call book.',
    author: 'EyesaikRizzle',
    store: 'US',
    lang: 'en',
  },
  {
    title: 'Excellent Field Service Organizer!',
    body: 'It has helped me to be more people conscious and time sensitive to accomplish my ministry.',
    author: 'Tonya RP',
    store: 'US',
    lang: 'en',
  },
  {
    title: 'Appreciate your app',
    body: 'A super efficient, easy to use app, I love the encouraging comments, and the address location options, thank you, it makes pioneering so much easier😊',
    author: 'Wottie Dottie',
    store: 'US',
    lang: 'en',
  },
  {
    title: 'La meilleure de toutes',
    body: 'Gros merci',
    author: 'Stef Pineault',
    store: 'CA',
    lang: 'fr',
  },
]
