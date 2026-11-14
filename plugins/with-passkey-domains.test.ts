import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { webCredentialsDomains } = require('./with-passkey-domains')

it('lists the webcredentials hosts without their mode', () => {
  expect(
    webCredentialsDomains([
      'applinks:ww-proxy.leviwilkerson.com',
      'applinks:beta.witnesswork.app?mode=developer',
      'webcredentials:beta.app.witnesswork.app?mode=developer',
      'webcredentials:app.witnesswork.app',
    ])
  ).toEqual(['beta.app.witnesswork.app', 'app.witnesswork.app'])
})

it('is empty when the app claims none', () => {
  expect(webCredentialsDomains(undefined)).toEqual([])
  expect(webCredentialsDomains(['applinks:example.com'])).toEqual([])
})
