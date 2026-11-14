/**
 * Every App Store territory (ISO 3166-1 alpha-2, lowercased for the iTunes
 * lookup `country` param), from App Store Connect `GET /v1/territories`.
 * WitnessWork is available in all of them (`availableInNewTerritories`).
 * Apple rarely adds storefronts; a missing one only undercounts.
 */
export const APP_STORE_STOREFRONTS: readonly string[] = [
  'af', 'ao', 'ai', 'al', 'ae', 'ar', 'am', 'ag', 'au', 'at', 'az', 'be',
  'bj', 'bf', 'bg', 'bh', 'bs', 'ba', 'by', 'bz', 'bm', 'bo', 'br', 'bb',
  'bn', 'bt', 'bw', 'ca', 'ch', 'cl', 'cn', 'ci', 'cm', 'cd', 'cg', 'co',
  'cv', 'cr', 'ky', 'cy', 'cz', 'de', 'dm', 'dk', 'do', 'dz', 'ec', 'eg',
  'es', 'ee', 'fi', 'fj', 'fr', 'fm', 'ga', 'gb', 'ge', 'gh', 'gm', 'gw',
  'gr', 'gd', 'gt', 'gy', 'hk', 'hn', 'hr', 'hu', 'id', 'in', 'ie', 'iq',
  'is', 'il', 'it', 'jm', 'jo', 'jp', 'kz', 'ke', 'kg', 'kh', 'kn', 'kr',
  'kw', 'la', 'lb', 'lr', 'ly', 'lc', 'lk', 'lt', 'lu', 'lv', 'mo', 'ma',
  'md', 'mg', 'mv', 'mx', 'mk', 'ml', 'mt', 'mm', 'me', 'mn', 'mz', 'mr',
  'ms', 'mu', 'mw', 'my', 'na', 'ne', 'ng', 'ni', 'nl', 'no', 'np', 'nr',
  'nz', 'om', 'pk', 'pa', 'pe', 'ph', 'pw', 'pg', 'pl', 'pt', 'py', 'qa',
  'ro', 'ru', 'rw', 'sa', 'sn', 'sg', 'sb', 'sl', 'sv', 'rs', 'st', 'sr',
  'sk', 'si', 'se', 'sz', 'sc', 'tc', 'td', 'th', 'tj', 'tm', 'to', 'tt',
  'tn', 'tr', 'tw', 'tz', 'ug', 'ua', 'uy', 'us', 'uz', 'vc', 've', 'vg',
  'vn', 'vu', 'xk', 'ye', 'za', 'zm', 'zw',
]
