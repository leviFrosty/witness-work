import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { webCredentialsDomains } = require('./with-passkey-domains')

it('lists the webcredentials hosts without their mode', () => {
  expect(
    webCredentialsDomains([
      'applinks:ww-proxy.leviwilkerson.com',
      'webcredentials:app-dev.witnesswork.app?mode=developer',
      'webcredentials:app.witnesswork.app',
    ])
  ).toEqual(['app-dev.witnesswork.app', 'app.witnesswork.app'])
})

it('is empty when the app claims none', () => {
  expect(webCredentialsDomains(undefined)).toEqual([])
  expect(webCredentialsDomains(['applinks:example.com'])).toEqual([])
})
