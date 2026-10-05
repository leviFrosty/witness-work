import type {
  RecognizedLine,
  RecognizedPage,
} from '../../../../modules/text-recognition'

// Horizontal gap (fraction of page width) between two pieces of one row that
// marks separate table cells, e.g. the columns of a house-to-house record.
const COLUMN_GAP = 0.04
// Vertical gap, in median line heights, that starts a new paragraph.
const PARAGRAPH_GAP = 0.9

interface Row {
  lines: RecognizedLine[]
  center: number
  height: number
  top: number
  bottom: number
}

const centerOf = (line: RecognizedLine) => line.y + line.height / 2

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

/** Joins a row's pieces left to right; wide gaps read as table columns. */
const rowText = (row: Row): string => {
  const pieces = [...row.lines].sort((a, b) => a.x - b.x)
  let text = pieces[0]?.text ?? ''
  for (let i = 1; i < pieces.length; i++) {
    const previous = pieces[i - 1]
    const gap = pieces[i].x - (previous.x + previous.width)
    text += (gap > COLUMN_GAP ? ' | ' : ' ') + pieces[i].text
  }
  return text
}

/**
 * Turns one page of recognized lines into editable text in reading order.
 * Pieces that share a baseline become one row (columns joined with " | " so a
 * record sheet keeps its rows together), and a large vertical gap becomes a
 * blank line between paragraphs. Pure, so any platform's recognizer can reuse
 * it.
 */
export const layoutRecognizedPage = (lines: RecognizedLine[]): string => {
  const items = lines
    .map((line) => ({ ...line, text: line.text.trim() }))
    .filter((line) => line.text && line.height > 0)
    .sort((a, b) => centerOf(a) - centerOf(b))
  if (!items.length) return ''

  const rows: Row[] = []
  for (const line of items) {
    const center = centerOf(line)
    const row = rows.at(-1)
    if (
      row &&
      Math.abs(center - row.center) < Math.min(line.height, row.height) / 2
    ) {
      row.lines.push(line)
      const n = row.lines.length
      row.center += (center - row.center) / n
      row.height += (line.height - row.height) / n
      row.top = Math.min(row.top, line.y)
      row.bottom = Math.max(row.bottom, line.y + line.height)
    } else {
      rows.push({
        lines: [line],
        center,
        height: line.height,
        top: line.y,
        bottom: line.y + line.height,
      })
    }
  }

  const lineHeight = median(rows.map((row) => row.height))
  let text = rowText(rows[0])
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].top - rows[i - 1].bottom
    text +=
      (gap > PARAGRAPH_GAP * lineHeight ? '\n\n' : '\n') + rowText(rows[i])
  }
  return text
}

/** Lays out every page, separating pages with a blank line. */
export const layoutRecognizedPages = (pages: RecognizedPage[]): string =>
  pages
    .map((page) => layoutRecognizedPage(page.lines))
    .filter(Boolean)
    .join('\n\n')
