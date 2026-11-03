/**
 * Columns and clusters within a line: a tab takes the columns to the next
 * tab stop; a cursor steps over a whole grapheme (an emoji with its
 * modifiers, a letter with its accents), never into half of a surrogate pair.
 */

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null
/** Enough text around a position to hold any real cluster. */
const CLUSTER_WINDOW = 64

/** The visual column of a character offset in a line. */
export function columnAt(text: string, ch: number, tabSize: number): number {
  let col = 0
  for (let i = 0; i < ch && i < text.length; i++)
    col = text.charCodeAt(i) === 9 ? col + tabSize - (col % tabSize) : col + 1
  return col
}

/** The character offset at a visual column (the nearest one; a column inside a tab is the tab's start or end, whichever is closer). */
export function offsetAt(text: string, col: number, tabSize: number): number {
  let c = 0
  for (let i = 0; i < text.length; i++) {
    const next = text.charCodeAt(i) === 9 ? c + tabSize - (c % tabSize) : c + 1
    if (next > col) return col - c <= next - col ? i : i + 1
    c = next
  }
  return text.length
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}

/** The offset after the cluster at `ch`. */
export function nextCluster(text: string, ch: number): number {
  if (ch >= text.length) return text.length
  if (segmenter) {
    for (const s of segmenter.segment(text.slice(ch, ch + CLUSTER_WINDOW)))
      return ch + s.segment.length
  }
  return ch + (isLowSurrogate(text.charCodeAt(ch + 1)) ? 2 : 1)
}

/** The offset before the cluster that ends at `ch`. */
export function prevCluster(text: string, ch: number): number {
  if (ch <= 0) return 0
  if (segmenter) {
    const start = Math.max(0, ch - CLUSTER_WINDOW)
    let last = start
    for (const s of segmenter.segment(text.slice(start, ch))) last = start + s.index
    return last
  }
  return ch - (ch >= 2 && isLowSurrogate(text.charCodeAt(ch - 1)) ? 2 : 1)
}

export type CharKind = 'word' | 'space' | 'other'

const WORD = /[\p{L}\p{N}\p{M}_$]/u

export function kindOf(char: string): CharKind {
  if (char === ' ' || char === '\t') return 'space'
  return WORD.test(char) ? 'word' : 'other'
}

/** Where a move by word to the right stops: past spaces, then past characters of one kind. */
export function wordEnd(text: string, ch: number): number {
  let i = ch
  while (i < text.length && kindOf(text[i]!) === 'space') i++
  if (i >= text.length) return text.length
  const kind = kindOf(text[i]!)
  while (i < text.length && kindOf(text[i]!) === kind) i++
  return i
}

/** Where a move by word to the left stops. */
export function wordStart(text: string, ch: number): number {
  let i = ch
  while (i > 0 && kindOf(text[i - 1]!) === 'space') i--
  if (i <= 0) return 0
  const kind = kindOf(text[i - 1]!)
  while (i > 0 && kindOf(text[i - 1]!) === kind) i--
  return i
}

/** The word (or run of one kind) around an offset, for a double click. */
export function wordAround(text: string, ch: number): [number, number] {
  if (text === '') return [0, 0]
  const at = ch < text.length ? ch : ch - 1
  const kind = kindOf(text[at]!)
  let from = at
  let to = at + 1
  while (from > 0 && kindOf(text[from - 1]!) === kind) from--
  while (to < text.length && kindOf(text[to]!) === kind) to++
  return [from, to]
}

/** The leading spaces and tabs of a line. */
export function indentOf(text: string): string {
  return /^[ \t]*/.exec(text)![0]
}
