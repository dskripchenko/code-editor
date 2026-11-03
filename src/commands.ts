/**
 * Editing commands: each looks at the state and gives the transaction that
 * does its job (or null when there is nothing to do). Every command works on
 * all cursors at once.
 */
import { SelectionRange, Selection } from './state/selection'
import type { Change } from './state/changes'
import { ChangeSet } from './state/changes'
import type { EditorState, TransactionSpec } from './state/state'
import {
  columnAt,
  indentOf,
  nextCluster,
  offsetAt,
  prevCluster,
  wordAround,
  wordEnd,
  wordStart,
} from './text-measure'

/** What a command may need from the view. */
export interface CommandContext {
  /** Lines in a page, for Page Up and Page Down. */
  readonly pageLines: number
}

export type Command = (state: EditorState, context: CommandContext) => TransactionSpec | null

const DEFAULT_CONTEXT: CommandContext = { pageLines: 20 }

// Moving ---------------------------------------------------------------------

type Move = (state: EditorState, range: SelectionRange, context: CommandContext) => SelectionRange

function moveBy(move: Move, extend: boolean, collapse?: 'from' | 'to'): Command {
  return (state, context = DEFAULT_CONTEXT) => {
    const ranges = state.selection.ranges.map((r) => {
      if (!extend && collapse && !r.empty) return SelectionRange.cursor(r[collapse])
      const moved = move(state, r, context)
      return extend ? new SelectionRange(r.anchor, moved.head, moved.goal) : moved
    })
    const selection = Selection.create(ranges, state.selection.mainIndex)
    return { selection, userEvent: 'select', scrollIntoView: true }
  }
}

const charLeft: Move = (state, r) => {
  const line = state.doc.lineAt(r.head)
  if (r.head === line.from) return SelectionRange.cursor(Math.max(0, r.head - 1))
  return SelectionRange.cursor(line.from + prevCluster(line.text, r.head - line.from))
}

const charRight: Move = (state, r) => {
  const line = state.doc.lineAt(r.head)
  if (r.head === line.to) return SelectionRange.cursor(Math.min(state.doc.length, r.head + 1))
  return SelectionRange.cursor(line.from + nextCluster(line.text, r.head - line.from))
}

const wordLeft: Move = (state, r) => {
  const line = state.doc.lineAt(r.head)
  if (r.head === line.from) return SelectionRange.cursor(Math.max(0, r.head - 1))
  return SelectionRange.cursor(line.from + wordStart(line.text, r.head - line.from))
}

const wordRight: Move = (state, r) => {
  const line = state.doc.lineAt(r.head)
  if (r.head === line.to) return SelectionRange.cursor(Math.min(state.doc.length, r.head + 1))
  return SelectionRange.cursor(line.from + wordEnd(line.text, r.head - line.from))
}

/** Home: to the first non-space character, or to the line's start when already there. */
const lineBoundaryBackward: Move = (state, r) => {
  const line = state.doc.lineAt(r.head)
  const indent = line.from + indentOf(line.text).length
  return SelectionRange.cursor(r.head === indent && indent !== line.from ? line.from : indent)
}

const lineStart: Move = (state, r) => SelectionRange.cursor(state.doc.lineAt(r.head).from)
const lineEnd: Move = (state, r) => SelectionRange.cursor(state.doc.lineAt(r.head).to)
const docStart: Move = () => SelectionRange.cursor(0)
const docEnd: Move = (state) => SelectionRange.cursor(state.doc.length)

function vertical(lines: (context: CommandContext) => number): Move {
  return (state, r, context) => {
    const { tabSize } = state.config
    const line = state.doc.lineAt(r.head)
    const goal = r.goal ?? columnAt(line.text, r.head - line.from, tabSize)
    const target = line.index + lines(context)
    if (target < 0) return SelectionRange.cursor(0, goal)
    if (target >= state.doc.lineCount) return SelectionRange.cursor(state.doc.length, goal)
    const next = state.doc.line(target)
    return SelectionRange.cursor(next.from + offsetAt(next.text, goal, tabSize), goal)
  }
}

const lineUp = vertical(() => -1)
const lineDown = vertical(() => 1)
const pageUp = vertical((c) => -Math.max(1, c.pageLines))
const pageDown = vertical((c) => Math.max(1, c.pageLines))

export const cursorCharLeft = moveBy(charLeft, false, 'from')
export const cursorCharRight = moveBy(charRight, false, 'to')
export const selectCharLeft = moveBy(charLeft, true)
export const selectCharRight = moveBy(charRight, true)
export const cursorWordLeft = moveBy(wordLeft, false)
export const cursorWordRight = moveBy(wordRight, false)
export const selectWordLeft = moveBy(wordLeft, true)
export const selectWordRight = moveBy(wordRight, true)
export const cursorLineBoundaryBackward = moveBy(lineBoundaryBackward, false)
export const selectLineBoundaryBackward = moveBy(lineBoundaryBackward, true)
export const cursorLineStart = moveBy(lineStart, false)
export const selectLineStart = moveBy(lineStart, true)
export const cursorLineEnd = moveBy(lineEnd, false)
export const selectLineEnd = moveBy(lineEnd, true)
export const cursorLineUp = moveBy(lineUp, false)
export const cursorLineDown = moveBy(lineDown, false)
export const selectLineUp = moveBy(lineUp, true)
export const selectLineDown = moveBy(lineDown, true)
export const cursorPageUp = moveBy(pageUp, false)
export const cursorPageDown = moveBy(pageDown, false)
export const selectPageUp = moveBy(pageUp, true)
export const selectPageDown = moveBy(pageDown, true)
export const cursorDocStart = moveBy(docStart, false)
export const cursorDocEnd = moveBy(docEnd, false)
export const selectDocStart = moveBy(docStart, true)
export const selectDocEnd = moveBy(docEnd, true)

export const selectAll: Command = (state) => ({
  selection: Selection.single(0, state.doc.length),
  userEvent: 'select',
  scrollIntoView: false,
})

/** Escape: several cursors become the main one. */
export const simplifySelection: Command = (state) => {
  if (state.selection.ranges.length === 1) return null
  return { selection: state.selection.asSingle(), userEvent: 'select' }
}

// Editing --------------------------------------------------------------------

/** Changes per range, the cursors left after each change's inserted text. */
function replaceRanges(
  state: EditorState,
  make: (r: SelectionRange, i: number) => Change | null,
  userEvent: string,
): TransactionSpec | null {
  const list: Change[] = []
  state.selection.ranges.forEach((r, i) => {
    const c = make(r, i)
    if (c) list.push(c)
  })
  if (list.length === 0) return null
  const changes = ChangeSet.of(list)
  const ranges = state.selection.ranges.map((r) => SelectionRange.cursor(changes.mapPos(r.to, 1)))
  return { changes, selection: Selection.create(ranges, state.selection.mainIndex), userEvent }
}

/** Typed or inserted text, in place of each selection. */
export function insertText(text: string, userEvent = 'input.type'): Command {
  return (state) => {
    const ranges = state.selection.ranges
    // Pasted lines, one per cursor, when there are as many lines as cursors.
    const lines = text.split(/\r\n?|\n/)
    const spread = ranges.length > 1 && lines.length === ranges.length
    return replaceRanges(
      state,
      (r, i) => ({ from: r.from, to: r.to, insert: spread ? lines[i]! : text }),
      userEvent,
    )
  }
}

/** Enter: a line break, the new line indented as the one it was split from. */
export const insertNewline: Command = (state) =>
  replaceRanges(
    state,
    (r) => {
      const line = state.doc.lineAt(r.from)
      const indent = indentOf(line.text).slice(0, r.from - line.from)
      return { from: r.from, to: r.to, insert: '\n' + indent }
    },
    'input.type',
  )

export const insertTab: Command = (state) =>
  insertText(state.config.indentUnit)(state, DEFAULT_CONTEXT)

function deleteBy(by: (state: EditorState, pos: number) => number, userEvent: string): Command {
  return (state) => {
    const list: Change[] = []
    for (const r of state.selection.ranges) {
      if (!r.empty) list.push({ from: r.from, to: r.to, insert: '' })
      else {
        const target = by(state, r.head)
        if (target !== r.head)
          list.push({ from: Math.min(target, r.head), to: Math.max(target, r.head), insert: '' })
      }
    }
    if (list.length === 0) return null
    const changes = ChangeSet.of(list)
    const ranges = state.selection.ranges.map((r) =>
      SelectionRange.cursor(changes.mapPos(r.from, -1)),
    )
    return { changes, selection: Selection.create(ranges, state.selection.mainIndex), userEvent }
  }
}

const at = (move: Move) => (state: EditorState, pos: number) =>
  move(state, SelectionRange.cursor(pos), DEFAULT_CONTEXT).head

export const deleteCharBackward = deleteBy(at(charLeft), 'delete.backward')
export const deleteCharForward = deleteBy(at(charRight), 'delete.forward')
export const deleteWordBackward = deleteBy(at(wordLeft), 'delete.word')
export const deleteWordForward = deleteBy(at(wordRight), 'delete.word')
export const deleteToLineStart = deleteBy((state, pos) => {
  const line = state.doc.lineAt(pos)
  return pos === line.from ? Math.max(0, pos - 1) : line.from
}, 'delete.line')
export const deleteToLineEnd = deleteBy((state, pos) => {
  const line = state.doc.lineAt(pos)
  return pos === line.to ? Math.min(state.doc.length, pos + 1) : line.to
}, 'delete.line')

/** The selected text; with no selection, nothing (a whole-line copy comes with the editing commands). */
export function selectedText(state: EditorState): string {
  return state.selection.ranges
    .filter((r) => !r.empty)
    .map((r) => state.doc.slice(r.from, r.to))
    .join('\n')
}

/** Deletes the selections (for Cut). */
export const deleteSelection: Command = (state) =>
  replaceRanges(
    state,
    (r) => (r.empty ? null : { from: r.from, to: r.to, insert: '' }),
    'delete.cut',
  )

/** The word (or run of one kind of character) around an offset, as offsets of the text. */
export function wordAroundRange(state: EditorState, pos: number): [number, number] {
  const line = state.doc.lineAt(pos)
  const [from, to] = wordAround(line.text, pos - line.from)
  return [line.from + from, line.from + to]
}
