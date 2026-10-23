import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Static guards for the Android speech module (ADR 0018): on-device
// recognition only, never audio on disk, and the same contract as iOS.

const MODULE = 'modules/speech-transcription'
const SOURCES = join(MODULE, 'android/src/main/java')

const read = (path) => readFileSync(path, 'utf8')

const kotlinFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return kotlinFiles(path)
    return entry.name.endsWith('.kt') ? [path] : []
  })

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const kotlin = kotlinFiles(SOURCES).map((path) => ({
  path,
  code: stripComments(read(path)),
}))
const allKotlin = kotlin.map(({ code }) => code).join('\n')

test('the module config registers the Android module', () => {
  const config = JSON.parse(read(join(MODULE, 'expo-module.config.json')))
  assert.deepEqual(config.platforms, ['ios', 'android'])
  assert.deepEqual(config.android.modules, [
    'expo.modules.speechtranscription.SpeechTranscriptionModule',
  ])
  assert.match(allKotlin, /package expo\.modules\.speechtranscription/)
  assert.match(allKotlin, /class SpeechTranscriptionModule : Module\(\)/)
})

test('only the on-device recognizer is ever created', () => {
  assert.match(allKotlin, /SpeechRecognizer\.createOnDeviceSpeechRecognizer\(/)
  assert.match(allKotlin, /SpeechRecognizer\.isOnDeviceRecognitionAvailable\(/)
  const forbidden = [
    // Any recognizer that may send audio to a server, or a chosen component.
    [/createSpeechRecognizer\s*\(/, 'createSpeechRecognizer'],
    [/\bisRecognitionAvailable\s*\(/, 'isRecognitionAvailable'],
    // Languages only an online recognizer serves.
    [/onlineLanguages|getOnlineLanguages/i, 'online languages'],
    // The system's recognizer UI and web search intents.
    [/startActivity/, 'startActivity'],
    [
      /ACTION_WEB_SEARCH|EXTRA_WEB_SEARCH_ONLY|ACTION_VOICE_SEARCH/,
      'web search',
    ],
    // Network access from the module itself.
    [/java\.net\.|HttpURLConnection|okhttp/i, 'network client'],
  ]
  for (const { path, code } of kotlin) {
    for (const [pattern, label] of forbidden) {
      assert.doesNotMatch(code, pattern, `${path} uses ${label}`)
    }
  }
})

test('audio is never written to disk or handed back', () => {
  const forbidden = [
    /FileOutputStream|openFileOutput|\bFile\s*\(|RandomAccessFile/,
    // Recognizer extras that return or take recorded audio.
    /GET_AUDIO|EXTRA_AUDIO_SOURCE|AudioRecord\b|MediaRecorder/,
  ]
  for (const { path, code } of kotlin) {
    for (const pattern of forbidden) assert.doesNotMatch(code, pattern, path)
  }
})

test('the manifest asks for the microphone and nothing on the network', () => {
  const manifest = read(join(MODULE, 'android/src/main/AndroidManifest.xml'))
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/)
  assert.doesNotMatch(manifest, /android\.permission\.INTERNET/)
  const appConfig = read('app.config.ts')
  const blocked = appConfig.match(/blockedPermissions:\s*\[([\s\S]*?)\]/)
  assert.ok(blocked, 'app.config.ts has blockedPermissions')
  assert.doesNotMatch(stripComments(blocked[1]), /RECORD_AUDIO/)
})

test('Android exposes the same contract as index.ts and iOS', () => {
  const index = read(join(MODULE, 'index.ts'))
  const swift = read(join(MODULE, 'ios/SpeechTranscriptionModule.swift'))

  const nativeInterface = index.match(
    /interface SpeechTranscriptionNative \{([\s\S]*?)\n\}/
  )[1]
  const functions = [...nativeInterface.matchAll(/^\s+(\w+)\(/gm)]
    .map((match) => match[1])
    .filter((name) => name !== 'addListener')
  assert.ok(functions.length >= 6)
  for (const name of functions) {
    assert.match(allKotlin, new RegExp(`AsyncFunction\\("${name}"\\)`), name)
    assert.match(swift, new RegExp(`AsyncFunction\\("${name}"\\)`), name)
  }

  const events = [
    ...index
      .match(/type Events = \{([\s\S]*?)\n\}/)[1]
      .matchAll(/^\s+(\w+):/gm),
  ].map((match) => match[1])
  const kotlinEvents = allKotlin.match(/Events\(([^)]*)\)/)[1]
  for (const event of events)
    assert.ok(kotlinEvents.includes(`"${event}"`), event)

  assert.match(allKotlin, /Name\("SpeechTranscription"\)/)
  assert.match(allKotlin, /Constant\("speechTranscriptionVersion"\)/)

  const codes = [...index.matchAll(/(ERR_SPEECH_\w+):/g)].map((m) => m[1])
  assert.ok(codes.length >= 6)
  for (const code of [...codes, 'ERR_SPEECH_FAILED']) {
    assert.match(allKotlin, new RegExp(`"${code}"`), code)
  }

  assert.match(index, /\| 'androidOnDevice'/)
  assert.match(allKotlin, /ENGINE = "androidOnDevice"/)
})
