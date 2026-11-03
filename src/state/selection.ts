/**
 * Where the cursors are: one or more ranges, each with an anchor (where the
 * selection started) and a head (where the cursor is). A range keeps the
 * column a vertical move aims for (`goal`), so a cursor passing a short line
 * comes back to its column.
 */
import type { ChangeSet } from './changes'

export class SelectionRange {
  constructor(
    readonly anchor: number,
    readonly head: number,
    /** The visual column vertical moves aim for. */
    readonly goal?: number,
  ) {}

  static cursor(pos: number, goal?: number): SelectionRange {
    return new SelectionRange(pos, pos, goal)
  }

  get from(): number {
    return Math.min(this.anchor, this.head)
  }

  get to(): number {
    return Math.max(this.anchor, this.head)
  }

  get empty(): boolean {
    return this.anchor === this.head
  }

  map(changes: ChangeSet): SelectionRange {
    if (this.empty) return SelectionRange.cursor(changes.mapPos(this.head, 1))
    return new SelectionRange(
      changes.mapPos(this.anchor, this.anchor < this.head ? 1 : -1),
      changes.mapPos(this.head, this.head < this.anchor ? 1 : -1),
    )
  }
}

export class Selection {
  private constructor(
    readonly ranges: readonly SelectionRange[],
    readonly mainIndex: number,
  ) {}

  static single(anchor: number, head = anchor): Selection {
    return new Selection([new SelectionRange(anchor, head)], 0)
  }

  /** Ranges in any order: sorted, overlapping ones joined; `main` follows its range. */
  static create(ranges: readonly SelectionRange[], main = 0): Selection {
    if (ranges.length === 0) return Selection.single(0)
    const mainRange = ranges[Math.min(main, ranges.length - 1)]!
    const sorted = [...ranges].sort((a, b) => a.from - b.from)
    const out: SelectionRange[] = []
    let mainIndex = 0
    for (const r of sorted) {
      const last = out[out.length - 1]
      const isMain = r === mainRange
      if (last && (r.from < last.to || (r.from === last.to && (r.empty || last.empty)))) {
        const from = Math.min(last.from, r.from)
        const to = Math.max(last.to, r.to)
        const forward = last.head >= last.anchor
        out[out.length - 1] = forward ? new SelectionRange(from, to) : new SelectionRange(to, from)
        if (isMain) mainIndex = out.length - 1
      } else {
        out.push(r)
        if (isMain) mainIndex = out.length - 1
      }
    }
    return new Selection(out, mainIndex)
  }

  get main(): SelectionRange {
    return this.ranges[this.mainIndex]!
  }

  map(changes: ChangeSet): Selection {
    return Selection.create(
      this.ranges.map((r) => r.map(changes)),
      this.mainIndex,
    )
  }

  /** Only the main range. */
  asSingle(): Selection {
    return new Selection([this.main], 0)
  }

  clamp(length: number): Selection {
    const c = (n: number): number => Math.max(0, Math.min(n, length))
    return Selection.create(
      this.ranges.map((r) => new SelectionRange(c(r.anchor), c(r.head), r.goal)),
      this.mainIndex,
    )
  }

  eq(other: Selection): boolean {
    return (
      this.mainIndex === other.mainIndex &&
      this.ranges.length === other.ranges.length &&
      this.ranges.every(
        (r, i) => r.anchor === other.ranges[i]!.anchor && r.head === other.ranges[i]!.head,
      )
    )
  }
}
