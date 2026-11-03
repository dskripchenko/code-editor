/**
 * Diagnostics: what is wrong with the text, as ranges with a message — from
 * the editor's own check of data formats (@dskripchenko/syntax `validate`)
 * or set by the host (a language server, a linter). Ranges move with edits
 * until the next check replaces them.
 */
import type { ChangeSet } from '../state/changes'
import type { Doc } from '../state/doc'

export interface Diagnostic {
  /** Offsets into the text. */
  readonly from: number
  readonly to: number
  readonly message: string
  readonly severity: 'error' | 'warning' | 'info'
  /** Who reported it (`syntax` for the editor's own check). */
  readonly source?: string
}

export class Diagnostics {
  private bySource = new Map<string, Diagnostic[]>()
  private all: Diagnostic[] = []

  get list(): readonly Diagnostic[] {
    return this.all
  }

  /** Replaces one source's diagnostics; true when anything changed. */
  set(source: string, list: readonly Diagnostic[], length: number): boolean {
    const clamped = list.map((d) => {
      const from = Math.max(0, Math.min(length, d.from))
      return { ...d, from, to: Math.max(from, Math.min(length, d.to)), source }
    })
    const old = this.bySource.get(source) ?? []
    if (old.length === 0 && clamped.length === 0) return false
    if (clamped.length) this.bySource.set(source, clamped)
    else this.bySource.delete(source)
    this.rebuild()
    return true
  }

  /** The text changed: every range follows it; one whose text was deleted goes. */
  map(changes: ChangeSet): void {
    if (this.all.length === 0) return
    for (const [source, list] of this.bySource) {
      const moved: Diagnostic[] = []
      for (const d of list) {
        const from = changes.mapPos(d.from, 1)
        const to = Math.max(from, changes.mapPos(d.to, -1))
        if (to > from || d.to === d.from) moved.push({ ...d, from, to })
      }
      this.bySource.set(source, moved)
    }
    this.rebuild()
  }

  clear(): void {
    this.bySource.clear()
    this.all = []
  }

  private rebuild(): void {
    this.all = [...this.bySource.values()].flat().sort((a, b) => a.from - b.from || a.to - b.to)
  }
}

const WORD = /[\p{L}\p{N}_$-]/u

/** The editor's own check's findings (1-based lines and columns) as ranges: from the point to its word's end. */
export function fromValidation(
  doc: Doc,
  list: readonly { line: number; column: number; message: string; severity: 'error' | 'warning' }[],
): Diagnostic[] {
  return list.map((v) => {
    const index = Math.max(0, Math.min(doc.lineCount - 1, v.line - 1))
    const line = doc.line(index)
    const ch = Math.max(0, Math.min(line.text.length, v.column - 1))
    let end = ch
    while (end < line.text.length && WORD.test(line.text[end]!)) end++
    if (end === ch) end = Math.min(line.text.length, ch + 1)
    return {
      from: line.from + ch,
      to: line.from + end,
      message: v.message,
      severity: v.severity,
      source: 'syntax',
    }
  })
}
