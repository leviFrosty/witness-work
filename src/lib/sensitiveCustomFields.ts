// Advisory English phrase list, not a classifier or validation rule. Add common
// terms here as needed; unmatched text is not necessarily free of sensitive data.
const sensitiveCustomFieldPatterns = [
  /\b(religion|religious|faith|beliefs?|church|denomination|catholic|protestant|christian|muslim|islam|jewish|judaism|hindu|buddhist|atheist|agnostic)\b/i,
  /\b(health|medical|diagnosis|diagnoses|disability|disabled|illness|disease|medication|mental health|depression|cancer|diabetes|pregnant|pregnancy)\b/i,
  /\b(family|marital|married|divorced|divorce|widow|widowed|spouse|husband|wife|children|kids|single parent)\b/i,
  /\b(language|languages|mother tongue|native tongue|english|spanish|french|german|portuguese|mandarin|arabic|korean|japanese)\b/i,
  /\b(ethnicity|ethnic|race|racial|ancestry|nationality|national origin|african|asian|hispanic|latino|latina|caucasian)\b/i,
]

export function hasSensitiveCustomFieldText(text: string): boolean {
  const normalized = text.normalize('NFKC').replace(/[-_\s]+/g, ' ')
  return sensitiveCustomFieldPatterns.some((pattern) =>
    pattern.test(normalized)
  )
}
