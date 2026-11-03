/**
 * The editor's state — the text and the cursors — and the one way to change
 * it: a transaction (changes plus the selection after them).
 */
import { ChangeSet, type Change } from './changes'
import { Doc } from './doc'
import { Selection } from './selection'

export interface EditorConfig {
  /** Columns a tab takes (4). */
  readonly tabSize: number
  /** What Tab inserts (four spaces). */
  readonly indentUnit: string
}

export interface TransactionSpec {
  readonly changes?: Change | readonly Change[] | ChangeSet
  /** The selection after the changes; without it, the old one follows the changes. */
  readonly selection?: Selection
  /** What made it: `input.type`, `input.paste`, `input.compose`, `delete.backward`, `select`, `undo`… */
  readonly userEvent?: string
  readonly scrollIntoView?: boolean
  /** Kept in the undo history (true when the text changes). */
  readonly addToHistory?: boolean
}

export interface Transaction {
  readonly changes: ChangeSet
  /** The changes that undo this transaction. */
  readonly inverse: ChangeSet
  readonly selectionBefore: Selection
  readonly selection: Selection
  readonly userEvent?: string
  readonly scrollIntoView: boolean
  readonly addToHistory: boolean
  readonly docChanged: boolean
  /** The lines it changed: lines `from` to `oldEnd` (excluded) of the text before are lines `from` to `newEnd` now. */
  readonly lines: LineChange | null
  /**
   * The changes as line and character (UTF-16) ranges of the text before,
   * the last one first: applied in this order, each range stays right (as a
   * language server's incremental sync wants them).
   */
  readonly edits: readonly PositionEdit[]
}

export interface Position {
  /** 0-based. */
  readonly line: number
  /** UTF-16 units from the line's start. */
  readonly character: number
}

export interface PositionEdit {
  readonly from: Position
  readonly to: Position
  readonly text: string
}

export interface LineChange {
  readonly from: number
  readonly oldEnd: number
  readonly newEnd: number
}

/** Two line changes, one after the other, as one. */
export function composeLines(a: LineChange | null, b: LineChange | null): LineChange | null {
  if (!a) return b
  if (!b) return a
  const end = Math.max(a.newEnd, b.oldEnd)
  return {
    from: Math.min(a.from, b.from),
    oldEnd: end + a.oldEnd - a.newEnd,
    newEnd: end + b.newEnd - b.oldEnd,
  }
}

export function toChangeSet(changes: TransactionSpec['changes']): ChangeSet {
  if (!changes) return ChangeSet.empty
  if (changes instanceof ChangeSet) return changes
  return ChangeSet.of(Array.isArray(changes) ? changes : [changes as Change])
}

export class EditorState {
  selection: Selection

  constructor(
    readonly doc: Doc,
    selection: Selection = Selection.single(0),
    readonly config: EditorConfig = { tabSize: 4, indentUnit: '    ' },
  ) {
    this.selection = selection.clamp(doc.length)
  }

  static of(text: string, config?: Partial<EditorConfig>): EditorState {
    return new EditorState(new Doc(text), Selection.single(0), {
      tabSize: 4,
      indentUnit: '    ',
      ...config,
    })
  }

  /** Applies a transaction: the text changes in place. */
  update(spec: TransactionSpec): Transaction {
    const changes = toChangeSet(spec.changes)
    const inverse = changes.invert(this.doc)
    const selectionBefore = this.selection
    let lines: LineChange | null = null
    const at = (offset: number): Position => {
      const line = this.doc.lineAt(offset)
      return { line: line.index, character: offset - line.from }
    }
    const edits: PositionEdit[] = [...changes.changes]
      .reverse()
      .map((c) => ({ from: at(c.from), to: at(c.to), text: c.insert }))
    if (!changes.empty) {
      const list = changes.changes
      const from = this.doc.lineAt(list[0]!.from).index
      const oldEnd = this.doc.lineAt(list[list.length - 1]!.to).index + 1
      const count = this.doc.lineCount
      changes.apply(this.doc)
      lines = { from, oldEnd, newEnd: oldEnd + this.doc.lineCount - count }
    }
    this.selection = (spec.selection ?? selectionBefore.map(changes)).clamp(this.doc.length)
    return {
      changes,
      inverse,
      selectionBefore,
      selection: this.selection,
      userEvent: spec.userEvent,
      scrollIntoView: spec.scrollIntoView ?? true,
      addToHistory: spec.addToHistory ?? !changes.empty,
      docChanged: !changes.empty,
      lines,
      edits,
    }
  }
}
