#!/usr/bin/env node
// Rebuilds the backup a user attached to Buddies feedback.
//
//   node --env-file=.env scripts/buddies-feedback-backup.mjs <feedback_id> [out.json]
//
// Needs POSTHOG_CLI_HOST, POSTHOG_CLI_PROJECT_ID and POSTHOG_CLI_API_KEY. The
// `feedback_id` is on the survey response and its `survey attachment` events.
// The file holds a user's contacts and notes: keep it off shared drives and
// delete it once the issue is resolved.
import { writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const [feedbackId, out = `buddies-feedback-${feedbackId}.json`] =
  process.argv.slice(2)
const { POSTHOG_CLI_HOST, POSTHOG_CLI_PROJECT_ID, POSTHOG_CLI_API_KEY } =
  process.env
if (!feedbackId || !/^[A-Za-z0-9_-]+$/.test(feedbackId)) {
  console.error('Usage: buddies-feedback-backup.mjs <feedback_id> [out.json]')
  process.exit(1)
}
if (!POSTHOG_CLI_HOST || !POSTHOG_CLI_PROJECT_ID || !POSTHOG_CLI_API_KEY) {
  console.error('Missing POSTHOG_CLI_* environment variables')
  process.exit(1)
}

const response = await fetch(
  `${POSTHOG_CLI_HOST}/api/projects/${POSTHOG_CLI_PROJECT_ID}/query/`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${POSTHOG_CLI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: {
        kind: 'HogQLQuery',
        query: `SELECT toInt(properties.part), toInt(properties.parts), properties.data
          FROM events
          WHERE event = 'survey attachment'
            AND properties.kind = 'backup'
            AND properties.feedback_id = {feedbackId}
          ORDER BY toInt(properties.part)`,
        values: { feedbackId },
      },
    }),
  }
)
if (!response.ok) {
  console.error(`PostHog query failed: ${response.status}`)
  console.error(await response.text())
  process.exit(1)
}

const { results } = await response.json()
const parts = new Map(
  results.map(([part, total, data]) => [part, { total, data }])
)
const total = results[0]?.[1]
if (!total) {
  console.error('No backup attached to this feedback')
  process.exit(1)
}
const missing = Array.from({ length: total }, (_, i) => i + 1).filter(
  (part) => !parts.has(part)
)
if (missing.length) {
  console.error(`Missing parts ${missing.join(', ')} of ${total}`)
  process.exit(1)
}

const encoded = Array.from({ length: total }, (_, i) => parts.get(i + 1).data)
const json = gunzipSync(Buffer.from(encoded.join(''), 'base64url')).toString()
writeFileSync(out, JSON.stringify(JSON.parse(json), null, 2))
console.log(`Wrote ${out}`)
