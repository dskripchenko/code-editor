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
    changes.apply(this.doc)
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
    }
  }
}
