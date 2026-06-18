const BASE_URL = 'https://ww-proxy.leviwilkerson.com'

// Notes Import may target a separate (dev/staging) worker so the App Attest
// dev-bypass path never touches production. Falls back to the prod proxy.
const NOTES_BASE_URL = process.env.EXPO_PUBLIC_NOTES_IMPORT_BASE_URL || BASE_URL

export default {
  geocode: `${BASE_URL}/geocode`,
  autocomplete: `${BASE_URL}/autocomplete`,
  notesImport: `${NOTES_BASE_URL}/notes-import`,
  notesImportChallenge: `${NOTES_BASE_URL}/notes-import/challenge`,
  notesImportAttest: `${NOTES_BASE_URL}/notes-import/attest`,
}
