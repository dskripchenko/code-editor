/**
 * The text being edited: its lines (line breaks normalized to `\n`, one
 * character each in offsets). Changed in place — a 50 MB file is not copied
 * on every key. Line starts are worked out lazily from the first line a
 * change touched, so typing near the top of a big file stays cheap until
 * something asks about a line far below.
 */

export interface Line {
  /** 0-based. */
  readonly index: number
  readonly from: number
  readonly to: number
  readonly text: string
}

/** Above this many lines a splice is done by concatenation (spread arguments have a limit). */
const SPREAD_LIMIT = 10_000
/** Line starts worked out at a time when an offset lies past the known ones. */
const STARTS_CHUNK = 4096

export class Doc {
  private lines: string[]
  /** starts[i] is valid for i <= known. */
  private starts: number[] = [0]
  private known = 0
  private len: number
  /** Bumped on every change. */
  version = 0

  constructor(text = '') {
    this.lines = text.split(/\r?\n/)
    this.len = this.lines.reduce((n, l) => n + l.length, this.lines.length - 1)
  }

  get length(): number {
    return this.len
  }

  get lineCount(): number {
    return this.lines.length
  }

  /** The text of a line (0-based). */
  lineText(index: number): string {
    return this.lines[index] ?? ''
  }

  /** The offset where a line (0-based) starts. */
  lineStart(index: number): number {
    index = Math.max(0, Math.min(index, this.lines.length - 1))
    this.ensure(index)
    return this.starts[index]!
  }

  lineEnd(index: number): number {
    return this.lineStart(index) + this.lineText(index).length
  }

  line(index: number): Line {
    index = Math.max(0, Math.min(index, this.lines.length - 1))
    const from = this.lineStart(index)
    const text = this.lines[index]!
    return { index, from, to: from + text.length, text }
  }

  /** The line an offset is on (an offset at a line's end is on that line). */
  lineAt(pos: number): Line {
    pos = Math.max(0, Math.min(pos, this.len))
    const last = this.lines.length - 1
    while (this.known < last && this.starts[this.known]! <= pos)
      this.ensure(Math.min(last, this.known + STARTS_CHUNK))
    let lo = 0
    let hi = this.known
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.starts[mid]! <= pos) lo = mid
      else hi = mid - 1
    }
    return this.line(lo)
  }

  /** The text between two offsets, with `\n` between lines. */
  slice(from: number, to: number): string {
    from = Math.max(0, Math.min(from, this.len))
    to = Math.max(from, Math.min(to, this.len))
    const a = this.lineAt(from)
    const b = this.lineAt(to)
    if (a.index === b.index) return a.text.slice(from - a.from, to - a.from)
    const parts = [a.text.slice(from - a.from)]
    for (let i = a.index + 1; i < b.index; i++) parts.push(this.lines[i]!)
    parts.push(b.text.slice(0, to - b.from))
    return parts.join('\n')
  }

  /** Replaces the text between two offsets; `insert` has `\n` line breaks. */
  replace(from: number, to: number, insert: string): void {
    const a = this.lineAt(from)
    const b = this.lineAt(to)
    const parts = (a.text.slice(0, from - a.from) + insert + b.text.slice(to - b.from)).split('\n')
    const count = b.index - a.index + 1
    if (parts.length < SPREAD_LIMIT && count < SPREAD_LIMIT)
      this.lines.splice(a.index, count, ...parts)
    else this.lines = this.lines.slice(0, a.index).concat(parts, this.lines.slice(b.index + 1))
    this.len += insert.length - (to - from)
    this.known = Math.min(this.known, a.index)
    this.starts.length = this.known + 1
    this.version++
  }

  /** The whole text, its lines joined by `lineBreak`. */
  toString(lineBreak = '\n'): string {
    return this.lines.join(lineBreak)
  }

  /** The length of the longest line, in characters. */
  longestLine(): number {
    let max = 0
    for (const l of this.lines) if (l.length > max) max = l.length
    return max
  }

  private ensure(index: number): void {
    for (let k = this.known; k < index; k++)
      this.starts[k + 1] = this.starts[k]! + this.lines[k]!.length + 1
    if (index > this.known) this.known = index
  }
}
