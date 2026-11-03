/**
 * Search in the text, line by line (a match does not span lines): plain
 * text or a regular expression, with case and whole words as options. Only
 * the lines asked for are read, so the matches in view of a big file cost
 * what is in view.
 */
import type { Doc } from './state/doc'

export interface SearchQuery {
  readonly search: string
  readonly caseSensitive?: boolean
  readonly wholeWord?: boolean
  /** `search` is a regular expression (JavaScript's); `$1` in `replace` names its groups. */
  readonly regexp?: boolean
  readonly replace?: string
}

export interface Match {
  readonly from: number
  readonly to: number
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The query as a regular expression; null when it is empty or not a valid one. */
export function searchPattern(query: SearchQuery): RegExp | null {
  if (!query.search) return null
  let source = query.regexp ? query.search : escape(query.search)
  if (query.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
  try {
    return new RegExp(source, `g${query.caseSensitive ? '' : 'i'}u`)
  } catch {
    return null
  }
}

/** The matches on lines `from` to `to` (excluded), at most `limit`. */
export function matchesIn(
  doc: Doc,
  re: RegExp,
  from: number,
  to: number,
  limit = Infinity,
): Match[] {
  const out: Match[] = []
  for (let i = Math.max(0, from); i < Math.min(doc.lineCount, to) && out.length < limit; i++) {
    const text = doc.lineText(i)
    const start = doc.lineStart(i)
    re.lastIndex = 0
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m[0] === '') {
        re.lastIndex++
        if (re.lastIndex > text.length) break
        continue
      }
      out.push({ from: start + m.index, to: start + m.index + m[0].length })
      if (out.length >= limit) break
    }
  }
  return out
}

/** The first match at or after `pos` (the last one ending at or before it, `backwards`), round past the end; null when none. */
export function findFrom(doc: Doc, re: RegExp, pos: number, backwards = false): Match | null {
  const count = doc.lineCount
  const first = doc.lineAt(pos).index
  for (let k = 0; k <= count; k++) {
    const i = backwards ? (((first - k) % count) + count) % count : (first + k) % count
    const found = matchesIn(doc, re, i, i + 1)
    if (found.length === 0) continue
    // The cursor's own line is read twice: the part past the cursor first, the rest after going round.
    const ok = (m: Match) =>
      k === 0
        ? backwards
          ? m.to <= pos
          : m.from >= pos
        : k === count
          ? backwards
            ? m.to > pos
            : m.from < pos
          : true
    const pick = backwards ? found.filter(ok).pop() : found.find(ok)
    if (pick) return pick
  }
  return null
}

/** The replacement for a match: the text itself, or with `$1`, `$&`… filled in for a regular expression. */
export function replacementFor(doc: Doc, re: RegExp, query: SearchQuery, match: Match): string {
  const replace = query.replace ?? ''
  if (!query.regexp) return replace
  const text = doc.slice(match.from, match.to)
  const one = new RegExp(re.source, re.flags.replace('g', ''))
  return text.replace(one, replace)
}
