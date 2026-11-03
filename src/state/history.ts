/**
 * Undo and redo by transaction. Typing, deleting and composing go into one
 * step while they follow each other quickly; moving the cursor, a pause or
 * another kind of edit starts the next step. Undo brings back the cursors as
 * they were before the step, redo as they were after it.
 */
import type { ChangeSet } from './changes'
import type { Selection } from './selection'
import type { EditorState, Transaction, TransactionSpec } from './state'

interface Step {
  readonly changes: ChangeSet
  readonly inverse: ChangeSet
}

interface Entry {
  readonly steps: Step[]
  readonly before: Selection
  after: Selection
  readonly event?: string
  time: number
}

/** Edits that join the step before them. */
const GROUPED = new Set(['input.type', 'input.compose', 'delete.backward', 'delete.forward'])

export class History {
  private done: Entry[] = []
  private undone: Entry[] = []
  private broken = false

  constructor(
    /** Milliseconds between edits that still join one step. */
    private readonly groupDelay = 500,
    private readonly depth = 1000,
  ) {}

  get canUndo(): boolean {
    return this.done.length > 0
  }

  get canRedo(): boolean {
    return this.undone.length > 0
  }

  /** Keeps a transaction; a selection-only one ends the current step. */
  record(tr: Transaction, now = Date.now()): void {
    if (!tr.docChanged) {
      if (tr.userEvent !== 'undo' && tr.userEvent !== 'redo') this.broken = true
      return
    }
    if (!tr.addToHistory) return
    this.undone = []
    const step = { changes: tr.changes, inverse: tr.inverse }
    const last = this.done[this.done.length - 1]
    if (
      last &&
      !this.broken &&
      tr.userEvent &&
      last.event === tr.userEvent &&
      GROUPED.has(tr.userEvent) &&
      now - last.time < this.groupDelay
    ) {
      last.steps.push(step)
      last.after = tr.selection
      last.time = now
    } else {
      this.done.push({
        steps: [step],
        before: tr.selectionBefore,
        after: tr.selection,
        event: tr.userEvent,
        time: now,
      })
      if (this.done.length > this.depth) this.done.shift()
    }
    this.broken = false
  }

  /** The next edit starts a new step. */
  breakGroup(): void {
    this.broken = true
  }

  clear(): void {
    this.done = []
    this.undone = []
  }

  /** Undoes the last step; the transactions it took, for the view to draw. */
  undo(state: EditorState): Transaction[] {
    const entry = this.done.pop()
    if (!entry) return []
    const out = entry.steps
      .slice()
      .reverse()
      .map((s, i, all) =>
        state.update(this.spec(s.inverse, i === all.length - 1 ? entry.before : undefined, 'undo')),
      )
    this.undone.push(entry)
    this.broken = true
    return out
  }

  redo(state: EditorState): Transaction[] {
    const entry = this.undone.pop()
    if (!entry) return []
    const out = entry.steps.map((s, i, all) =>
      state.update(this.spec(s.changes, i === all.length - 1 ? entry.after : undefined, 'redo')),
    )
    this.done.push(entry)
    this.broken = true
    return out
  }

  private spec(
    changes: ChangeSet,
    selection: Selection | undefined,
    userEvent: string,
  ): TransactionSpec {
    return { changes, selection, userEvent, addToHistory: false }
  }
}
