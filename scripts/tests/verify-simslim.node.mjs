import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { PROFILE, parseServices, simslimBin } from '../verify/simslim.mjs'

test('WW_VERIFY_SIMSLIM=0 boots simulators stock', () => {
  assert.equal(simslimBin({ WW_VERIFY_SIMSLIM: '0' }), null)
})

test('WW_VERIFY_SIMSLIM names the binary, which must exist', () => {
  assert.equal(
    simslimBin({ WW_VERIFY_SIMSLIM: process.execPath }),
    process.execPath
  )
  assert.equal(simslimBin({ WW_VERIFY_SIMSLIM: '/nope/simslim' }), null)
})

test('--services takes categories or launchd labels, comma or space separated', () => {
  assert.deepEqual(parseServices(undefined), [])
  assert.deepEqual(parseServices('widgets'), ['widgets'])
  assert.deepEqual(parseServices('widgets, store com.apple.apsd,widgets'), [
    'widgets',
    'store',
    'com.apple.apsd',
  ])
  assert.deepEqual(parseServices('all'), ['all'])
  assert.throws(() => parseServices(true), /needs a value/)
})

test('the profile keeps what the verify flows use', () => {
  const profile = JSON.parse(fs.readFileSync(PROFILE, 'utf8'))
  assert.deepEqual(Object.keys(profile).sort(), [
    'description',
    'except',
    'keep',
    'name',
  ])
  for (const category of ['pim', 'photos'])
    assert.ok(profile.except.includes(category), category)
  for (const label of ['com.apple.apsd', 'com.apple.swcd'])
    assert.ok(profile.keep.includes(label), label)
})
