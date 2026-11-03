/**
 * Folding: the ranges a reader can fold (from @dskripchenko/syntax, read
 * again a moment after the text changes), the ones folded, and the mapping
 * between the text's lines and the rows on screen that folded lines leave.
 */
import type { LineChange } from '../state/state'

/** Lines `start` to `end` (0-based, inclusive): `start` stays in view, the rest fold away. */
export interface Fold {
  readonly start: number
  readonly end: number
}

export class Folding {
  /** What can be folded, by first line. */
  private available = new Map<number, number>()
  /** What is folded, by first line (nested ones too). */
  private folded = new Map<number, number>()
  /** The hidden lines as disjoint runs [from, to] (inclusive), in order. */
  private hidden: [number, number][] = []
  /** Hidden lines before each run, for the mapping. */
  private before: number[] = []

  /** Sets what can be folded; folds that no longer can are opened. */
  setAvailable(ranges: readonly Fold[]): boolean {
    const next = new Map(ranges.map((r) => [r.start, r.end]))
    if (
      next.size === this.available.size &&
      [...next].every(([k, v]) => this.available.get(k) === v)
    )
      return false
    this.available = next
    for (const [start, end] of this.folded) {
      const now = this.available.get(start)
      if (now === undefined) this.folded.delete(start)
      else if (now !== end) this.folded.set(start, now)
    }
    this.rebuild()
    return true
  }

  /** The fold that starts on a line, if one can. */
  availableAt(line: number): Fold | null {
    const end = this.available.get(line)
    return end === undefined ? null : { start: line, end }
  }

  isFolded(line: number): boolean {
    return this.folded.has(line)
  }

  get folds(): Fold[] {
    return [...this.folded]
      .map(([start, end]) => ({ start, end }))
      .sort((a, b) => a.start - b.start)
  }

  /** Folds the range starting on `line`, or else the innermost one around it; false when there is none. */
  fold(line: number): boolean {
    let best: Fold | null = null
    for (const [start, end] of this.available) {
      if (start === line) {
        best = { start, end }
        break
      }
      if (start < line && end >= line && !this.folded.has(start) && (!best || start > best.start))
        best = { start, end }
    }
    if (!best || this.folded.has(best.start)) return false
    this.folded.set(best.start, best.end)
    this.rebuild()
    return true
  }

  /** Opens the fold starting on `line`, or the folds around it; false when there is none. */
  unfold(line: number): boolean {
    let changed = this.folded.delete(line)
    if (!changed)
      for (const [start, end] of this.folded)
        if (start < line && end >= line) changed = this.folded.delete(start) || changed
    if (changed) this.rebuild()
    return changed
  }

  foldAll(): void {
    for (const [start, end] of this.available) this.folded.set(start, end)
    this.rebuild()
  }

  unfoldAll(): boolean {
    if (this.folded.size === 0) return false
    this.folded.clear()
    this.rebuild()
    return true
  }

  /** Opens the folds that hide any of these lines (a cursor moved into one); true when any did. */
  reveal(lines: Iterable<number>): boolean {
    let changed = false
    for (const line of lines)
      if (this.isHidden(line))
        for (const [start, end] of this.folded)
          if (start < line && end >= line) changed = this.folded.delete(start) || changed
    if (changed) this.rebuild()
    return changed
  }

  /** The text changed: folds before or after it move, a fold it touches (but for its first line) opens. */
  map(change: LineChange): void {
    if (this.folded.size === 0 && this.available.size === 0) return
    const delta = change.newEnd - change.oldEnd
    const move = (from: Map<number, number>, keepTouched: boolean): Map<number, number> => {
      const out = new Map<number, number>()
      for (const [start, end] of from) {
        if (end < change.from) out.set(start, end)
        else if (start >= change.oldEnd) out.set(start + delta, end + delta)
        else if (
          keepTouched &&
          start === change.from &&
          change.oldEnd === start + 1 &&
          change.newEnd === start + 1
        )
          out.set(start, end)
      }
      return out
    }
    this.folded = move(this.folded, true)
    this.available = move(this.available, true)
    this.rebuild()
  }

  isHidden(line: number): boolean {
    const k = this.runAt(line)
    return k >= 0 && line <= this.hidden[k]![1]
  }

  /** The row a line is on (a hidden line: the row of the line its fold starts on). */
  rowOf(line: number): number {
    const k = this.runAt(line)
    if (k < 0) return line
    const [from, to] = this.hidden[k]!
    if (line <= to) return from - 1 - this.before[k]!
    return line - this.before[k]! - (to - from + 1)
  }

  /** The line on a row. */
  lineOf(row: number): number {
    // The last run that starts at or before the line the row would be without it.
    let lo = 0
    let hi = this.hidden.length - 1
    let k = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.hidden[mid]![0] - this.before[mid]! <= row) {
        k = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    if (k < 0) return row
    const [from, to] = this.hidden[k]!
    return row + this.before[k]! + (to - from + 1)
  }

  rowCount(lineCount: number): number {
    const n = this.hidden.length
    if (n === 0) return lineCount
    const [from, to] = this.hidden[n - 1]!
    return lineCount - this.before[n - 1]! - (to - from + 1)
  }

  /** The visible lines from `fromRow` to `toRow` (excluded). */
  linesOfRows(fromRow: number, toRow: number, lineCount: number): number[] {
    const out: number[] = []
    let line = this.lineOf(fromRow)
    for (let row = fromRow; row < toRow && line < lineCount; row++) {
      out.push(line)
      line++
      while (line < lineCount && this.isHidden(line)) {
        const k = this.runAt(line)
        line = this.hidden[k]![1] + 1
      }
    }
    return out
  }

  /** The last run whose first line is at or before `line`; -1 when none. */
  private runAt(line: number): number {
    let lo = 0
    let hi = this.hidden.length - 1
    let k = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.hidden[mid]![0] <= line) {
        k = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return k
  }

  private rebuild(): void {
    const runs = [...this.folded]
      .filter(([start, end]) => end > start)
      .map(([start, end]): [number, number] => [start + 1, end])
      .sort((a, b) => a[0] - b[0])
    const merged: [number, number][] = []
    for (const r of runs) {
      const last = merged[merged.length - 1]
      if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1])
      else merged.push([r[0], r[1]])
    }
    this.hidden = merged
    this.before = []
    let sum = 0
    for (const [from, to] of merged) {
      this.before.push(sum)
      sum += to - from + 1
    }
  }
}
