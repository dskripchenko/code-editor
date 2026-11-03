/**
 * A set of changes made at once (one per cursor, say): ranges of the text
 * before them, sorted and not overlapping. Everything that points into the
 * text — cursors, marks, folds — follows a change through `mapPos`.
 */
import type { Doc } from './doc'

export interface Change {
  readonly from: number
  readonly to: number
  readonly insert: string
}

export class ChangeSet {
  private constructor(readonly changes: readonly Change[]) {}

  static readonly empty = new ChangeSet([])

  /** Changes in any order; overlapping or touching ones are joined, inserted texts in their order. */
  static of(list: readonly Change[]): ChangeSet {
    const sorted = list
      .map((c) => ({
        from: Math.min(c.from, c.to),
        to: Math.max(c.from, c.to),
        insert: c.insert.replace(/\r\n?/g, '\n'),
      }))
      .filter((c) => c.from !== c.to || c.insert !== '')
      .sort((x, y) => x.from - y.from || x.to - y.to)
    const out: Change[] = []
    for (const c of sorted) {
      const last = out[out.length - 1]
      if (last && c.from < last.to)
        out[out.length - 1] = {
          from: last.from,
          to: Math.max(last.to, c.to),
          insert: last.insert + c.insert,
        }
      else out.push(c)
    }
    return new ChangeSet(out)
  }

  get empty(): boolean {
    return this.changes.length === 0
  }

  /** Applies the changes to the text (from the last, so the offsets stay true). */
  apply(doc: Doc): void {
    for (let i = this.changes.length - 1; i >= 0; i--) {
      const c = this.changes[i]!
      doc.replace(c.from, c.to, c.insert)
    }
  }

  /**
   * Where a position of the text before is after the changes. A position in
   * a replaced range goes to its start (`assoc` < 0) or its end; text
   * inserted exactly at the position goes after it (`assoc` < 0) or before.
   */
  mapPos(pos: number, assoc = -1): number {
    let delta = 0
    for (const c of this.changes) {
      if (c.from > pos) break
      const len = c.insert.length
      if (c.from === c.to) {
        if (c.from < pos || assoc > 0) {
          delta += len
          continue
        }
        break
      }
      if (c.to <= pos) {
        delta += len - (c.to - c.from)
        continue
      }
      if (c.from === pos) break
      return c.from + delta + (assoc < 0 ? 0 : len)
    }
    return pos + delta
  }

  /** The changes that undo these; `doc` is the text before them. */
  invert(doc: Doc): ChangeSet {
    let delta = 0
    const out: Change[] = []
    for (const c of this.changes) {
      const from = c.from + delta
      out.push({ from, to: from + c.insert.length, insert: doc.slice(c.from, c.to) })
      delta += c.insert.length - (c.to - c.from)
    }
    return new ChangeSet(out)
  }
}
