/**
 * What the page hangs on the gutter: marks beside lines (a diff's added,
 * changed or deleted lines; a breakpoint; a bookmark), each source its own
 * set, and annotations — a column of short text by the line numbers (who
 * changed a line and when). Both follow edits until the page sets them again.
 */
import type { LineChange } from '../state/state'

export interface GutterMark {
  /** 0-based. */
  readonly line: number
  /** Its look: a class `dsk-code-editor__mark--<kind>` (`added`, `modified`, `deleted` are drawn). */
  readonly kind: string
  readonly title?: string
}

export interface Annotation {
  /** 0-based. */
  readonly line: number
  readonly text: string
  readonly title?: string
}

/** A line number moved by an edit; null when the edit replaced its line. */
function moved(line: number, change: LineChange): number | null {
  if (line < change.from) return line
  if (line >= change.oldEnd) return line + change.newEnd - change.oldEnd
  return null
}

export class Gutter {
  private readonly marks = new Map<string, GutterMark[]>()
  private byLine = new Map<number, GutterMark>()
  private notes = new Map<number, Annotation>()
  private width = 0

  setMarks(source: string, marks: readonly GutterMark[]): void {
    if (marks.length) this.marks.set(source, [...marks])
    else this.marks.delete(source)
    this.index()
  }

  setAnnotations(list: readonly Annotation[] | null): void {
    this.notes = new Map((list ?? []).map((a) => [a.line, a]))
    this.width = list ? Math.max(0, ...list.map((a) => [...a.text].length)) : 0
  }

  get hasAnnotations(): boolean {
    return this.notes.size > 0
  }

  /** The annotation column's width, in characters. */
  get annotationChars(): number {
    return this.width
  }

  markAt(line: number): GutterMark | undefined {
    return this.byLine.get(line)
  }

  annotationAt(line: number): Annotation | undefined {
    return this.notes.get(line)
  }

  /** The text changed: everything moves with it; what stood on replaced lines goes. */
  map(change: LineChange): void {
    if (this.marks.size === 0 && this.notes.size === 0) return
    for (const [source, list] of this.marks) {
      const next: GutterMark[] = []
      for (const m of list) {
        const line = moved(m.line, change)
        if (line !== null) next.push({ ...m, line })
      }
      this.marks.set(source, next)
    }
    this.index()
    const notes = new Map<number, Annotation>()
    for (const a of this.notes.values()) {
      const line = moved(a.line, change)
      if (line !== null) notes.set(line, { ...a, line })
    }
    this.notes = notes
  }

  /** One mark a line: the last source set wins. */
  private index(): void {
    this.byLine = new Map()
    for (const list of this.marks.values()) for (const m of list) this.byLine.set(m.line, m)
  }
}
