/**
 * Editing commands: each looks at the state and gives the transaction that
 * does its job (or null when there is nothing to do). Every command works on
 * all cursors at once.
 */
import { SelectionRange, Selection } from './state/selection'
import type { Change } from './state/changes'
import { ChangeSet } from './state/changes'
import type { EditorState, TransactionSpec } from './state/state'
import { languageEditing, type LanguageEditing } from './language'
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
  /** The rows on screen, when folded lines leave fewer rows than lines: moves up and down go by rows. */
  readonly rows?: {
    readonly count: number
    rowOf(line: number): number
    lineOf(row: number): number
    /** Wrapped lines: the row a position is on, its column within that row, the position at a row's column. */
    rowOfPos?(pos: number): number
    goalOf?(pos: number): number
    posAtRow?(row: number, goal: number): number
  }
  /** The language's comments, pairs and indentation (C-like ones without it). */
  readonly language?: LanguageEditing
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
    const rows = context.rows
    // Wrapped lines: by the rows they make, the column within the row kept.
    if (rows?.rowOfPos && rows.goalOf && rows.posAtRow) {
      const goal = r.goal ?? rows.goalOf(r.head)
      const row = rows.rowOfPos(r.head) + lines(context)
      if (row < 0) return SelectionRange.cursor(0, goal)
      if (row >= rows.count) return SelectionRange.cursor(state.doc.length, goal)
      return SelectionRange.cursor(rows.posAtRow(row, goal), goal)
    }
    const line = state.doc.lineAt(r.head)
    const goal = r.goal ?? columnAt(line.text, r.head - line.from, tabSize)
    const row = (rows ? rows.rowOf(line.index) : line.index) + lines(context)
    if (row < 0) return SelectionRange.cursor(0, goal)
    if (row >= (rows ? rows.count : state.doc.lineCount))
      return SelectionRange.cursor(state.doc.length, goal)
    const next = state.doc.line(rows ? rows.lineOf(row) : row)
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

// Indentation ----------------------------------------------------------------

const lang = (context?: CommandContext): LanguageEditing =>
  context?.language ?? languageEditing(null)

/** The lines a selection covers; a selection ending at a line's start does not take that line. */
function linesOf(state: EditorState, r: SelectionRange): [number, number] {
  const doc = state.doc
  const a = doc.lineAt(r.from).index
  let b = doc.lineAt(r.to).index
  if (b > a && r.to === doc.lineStart(b)) b--
  return [a, b]
}

/** Each line once, in order, of all selections. */
function selectedLines(state: EditorState): number[] {
  const set = new Set<number>()
  for (const r of state.selection.ranges) {
    const [a, b] = linesOf(state, r)
    for (let i = a; i <= b; i++) set.add(i)
  }
  return [...set].sort((x, y) => x - y)
}

/** Changes, and every selection mapped through them (their ends stay put at an insertion before). */
function withChanges(
  state: EditorState,
  list: Change[],
  userEvent: string,
): TransactionSpec | null {
  if (list.length === 0) return null
  const changes = ChangeSet.of(list)
  const ranges = state.selection.ranges.map((r) => {
    if (r.empty) return SelectionRange.cursor(changes.mapPos(r.head, 1))
    const from = changes.mapPos(r.from, -1)
    const to = changes.mapPos(r.to, 1)
    return r.anchor < r.head ? new SelectionRange(from, to) : new SelectionRange(to, from)
  })
  return { changes, selection: Selection.create(ranges, state.selection.mainIndex), userEvent }
}

/** Mod-]: every selected line a step deeper (empty lines stay empty). */
export const indentMore: Command = (state) => {
  const unit = state.config.indentUnit
  const list: Change[] = []
  for (const i of selectedLines(state)) {
    const line = state.doc.line(i)
    if (line.text.trim() === '' && state.selection.ranges.some((r) => !r.empty)) continue
    list.push({ from: line.from, to: line.from, insert: unit })
  }
  return withChanges(state, list, 'input.indent')
}

/** The width of a run of indentation, in columns. */
function indentWidth(text: string, tabSize: number): number {
  return columnAt(text, text.length, tabSize)
}

/** Mod-[ and Shift-Tab: every selected line a step out. */
export const indentLess: Command = (state) => {
  const { tabSize, indentUnit } = state.config
  const step = indentUnit === '\t' ? tabSize : indentUnit.length
  const list: Change[] = []
  for (const i of selectedLines(state)) {
    const line = state.doc.line(i)
    const indent = indentOf(line.text)
    if (!indent) continue
    // Back to the previous stop: a tab, or the spaces down to it.
    const width = indentWidth(indent, tabSize)
    const target = Math.max(0, Math.ceil(width / step) * step - step)
    let cut = indent.length
    while (cut > 0 && indentWidth(indent.slice(0, cut), tabSize) > target) cut--
    list.push({ from: line.from + cut, to: line.from + indent.length, insert: '' })
  }
  return withChanges(state, list, 'delete.dedent')
}

/** Tab: over a selection of lines, they go a step deeper; else an indent (spaces to the next stop). */
export const insertTab: Command = (state, context) => {
  const ranges = state.selection.ranges
  const doc = state.doc
  if (ranges.some((r) => !r.empty && doc.lineAt(r.from).index !== doc.lineAt(r.to).index))
    return indentMore(state, context)
  const { indentUnit, tabSize } = state.config
  if (indentUnit === '\t') return insertText('\t')(state, context)
  return replaceRanges(
    state,
    (r) => {
      const line = state.doc.lineAt(r.from)
      const col = columnAt(line.text, r.from - line.from, tabSize)
      const step = indentUnit.length
      return { from: r.from, to: r.to, insert: ' '.repeat(step - (col % step)) }
    },
    'input.type',
  )
}

const OPENING = /[([{]\s*$/
const PAIRED: Record<string, string> = { '(': ')', '[': ']', '{': '}' }

/**
 * Enter: the new line indented as the one it was split from, a step deeper
 * after an opening bracket (or what the language indents after — `:` in
 * Python); between a bracket pair, the closing one goes a line further.
 */
export const insertNewline: Command = (state, context) => {
  const language = lang(context)
  const unit = state.config.indentUnit
  const list: Change[] = []
  const cursors: number[] = []
  let shift = 0
  for (const r of state.selection.ranges) {
    const line = state.doc.lineAt(r.from)
    const before = line.text.slice(0, r.from - line.from)
    const after = state.doc.lineAt(r.to).text.slice(r.to - state.doc.lineAt(r.to).from)
    const indent = indentOf(line.text).slice(0, before.length)
    const deeper = OPENING.test(before) || (language.indentAfter?.test(before) ?? false)
    const open = /([([{])\s*$/.exec(before)?.[1]
    const between = open !== undefined && after.trimStart().startsWith(PAIRED[open]!)
    // White space the cursor stood in is not carried to the new line.
    const rest = after.length - after.trimStart().length
    let insert = '\n' + indent + (deeper ? unit : '')
    const cursor = r.from + insert.length
    if (between) insert += '\n' + indent
    list.push({ from: r.from, to: r.to + (between ? rest : 0), insert })
    cursors.push(cursor + shift)
    shift += insert.length - (r.to + (between ? rest : 0) - r.from)
  }
  const changes = ChangeSet.of(list)
  return {
    changes,
    selection: Selection.create(
      cursors.map((c) => SelectionRange.cursor(c)),
      state.selection.mainIndex,
    ),
    userEvent: 'input.type',
  }
}

/** Where Backspace goes from an empty cursor: in a line's indentation of spaces, the previous stop. */
function backFrom(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos)
  const col = pos - line.from
  const before = line.text.slice(0, col)
  const unit = state.config.indentUnit
  if (col > 0 && unit !== '\t' && !before.includes('\t') && before.trim() === '') {
    const step = unit.length
    return line.from + Math.max(0, Math.ceil(col / step) * step - step)
  }
  return at(charLeft)(state, pos)
}

/**
 * Backspace: in a line's indentation, back to the previous stop; between a
 * pair (`(|)`, `"|"`), both; else a character.
 */
export const deleteBackward: Command = (state, context) => {
  const pairs = lang(context).pairs
  const doc = state.doc
  const list: Change[] = []
  for (const r of state.selection.ranges) {
    if (!r.empty) {
      list.push({ from: r.from, to: r.to, insert: '' })
      continue
    }
    const prev = doc.slice(Math.max(0, r.head - 1), r.head)
    const next = doc.slice(r.head, Math.min(doc.length, r.head + 1))
    if (prev && pairs.some(([o, c]) => o === prev && c === next)) {
      list.push({ from: r.head - 1, to: r.head + 1, insert: '' })
      continue
    }
    const target = backFrom(state, r.head)
    if (target !== r.head) list.push({ from: target, to: r.head, insert: '' })
  }
  if (list.length === 0) return null
  const changes = ChangeSet.of(list)
  const ranges = state.selection.ranges.map((r) =>
    SelectionRange.cursor(changes.mapPos(r.from, -1)),
  )
  return {
    changes,
    selection: Selection.create(ranges, state.selection.mainIndex),
    userEvent: 'delete.backward',
  }
}

// Typing with pairs ----------------------------------------------------------

/** After the cursor, what lets a pair close: nothing, white space, or a closing bracket or punctuation. */
const CLOSES_BEFORE = /^($|[\s)\]},;:.>])/
const WORD_CHAR = /[\p{L}\p{N}_]/u

/**
 * A typed character, as an editor types it: an opening bracket or quote
 * closes itself (or wraps a selection), a closing one steps over the same
 * character after the cursor. Other text is inserted as it is.
 */
export function typeText(text: string): Command {
  return (state, context) => {
    const pairs = lang(context).pairs
    const doc = state.doc
    const ranges = state.selection.ranges
    if ([...text].length !== 1) return insertText(text)(state, context)
    const opening = pairs.find(([o]) => o === text)
    const closing = pairs.find(([, c]) => c === text)
    const nextOf = (pos: number) => doc.slice(pos, Math.min(doc.length, pos + 1))
    const prevOf = (pos: number) => doc.slice(Math.max(0, pos - 1), pos)
    // A closing character typed before the same one: the cursor steps over it.
    if (closing && ranges.every((r) => r.empty && nextOf(r.head) === text)) {
      const sel = Selection.create(
        ranges.map((r) => SelectionRange.cursor(r.head + text.length)),
        state.selection.mainIndex,
      )
      return { selection: sel, userEvent: 'input.type' }
    }
    if (!opening) return insertText(text)(state, context)
    const [open, close] = opening
    const quote = open === close
    // Around a selection: wrapped, still selected.
    if (ranges.every((r) => !r.empty)) {
      const list: Change[] = []
      for (const r of ranges) {
        list.push({ from: r.from, to: r.from, insert: open })
        list.push({ from: r.to, to: r.to, insert: close })
      }
      const changes = ChangeSet.of(list)
      const sel = Selection.create(
        ranges.map((r) => {
          const from = changes.mapPos(r.from, 1)
          const to = changes.mapPos(r.to, -1)
          return r.anchor < r.head ? new SelectionRange(from, to) : new SelectionRange(to, from)
        }),
        state.selection.mainIndex,
      )
      return { changes, selection: sel, userEvent: 'input.type' }
    }
    const closes = ranges.every((r) => {
      if (!r.empty) return false
      if (!CLOSES_BEFORE.test(doc.slice(r.head, Math.min(doc.length, r.head + 1)))) return false
      // A quote after a letter is an apostrophe (`don't`), not a string.
      return !quote || !(WORD_CHAR.test(prevOf(r.head)) || prevOf(r.head) === open)
    })
    if (!closes) return insertText(text)(state, context)
    const changes = ChangeSet.of(
      ranges.map((r) => ({ from: r.head, to: r.head, insert: open + close })),
    )
    const sel = Selection.create(
      ranges.map((r) => SelectionRange.cursor(changes.mapPos(r.head, -1) + open.length)),
      state.selection.mainIndex,
    )
    return { changes, selection: sel, userEvent: 'input.type' }
  }
}

// Comments -------------------------------------------------------------------

/** Mod-/: the selected lines commented out with the language's line comment, or back in. */
export const toggleLineComment: Command = (state, context) => {
  const language = lang(context)
  const mark = language.lineComment
  if (!mark) return toggleBlockComment(state, context)
  const doc = state.doc
  const lines = selectedLines(state).map((i) => doc.line(i))
  const filled = lines.filter((l) => l.text.trim() !== '')
  const target = filled.length ? filled : lines
  const commented = target.every((l) => l.text.trimStart().startsWith(mark))
  const list: Change[] = []
  if (commented) {
    for (const l of target) {
      const at = l.from + indentOf(l.text).length
      const after = l.text.slice(indentOf(l.text).length + mark.length)
      list.push({ from: at, to: at + mark.length + (after.startsWith(' ') ? 1 : 0), insert: '' })
    }
    return withChanges(state, list, 'delete.comment')
  }
  // The mark at the least indentation of the lines, so a block reads as one.
  const column = Math.min(...target.map((l) => indentOf(l.text).length))
  for (const l of target)
    list.push({ from: l.from + column, to: l.from + column, insert: mark + ' ' })
  return withChanges(state, list, 'input.comment')
}

/** Shift-Alt-a: the selection (or the line) wrapped in the language's block comment, or unwrapped. */
export const toggleBlockComment: Command = (state, context) => {
  const marks = lang(context).blockComment
  if (!marks) return null
  const [open, close] = marks
  const doc = state.doc
  const list: Change[] = []
  for (const r of state.selection.ranges) {
    let from = r.from
    let to = r.to
    if (r.empty) {
      const line = doc.lineAt(r.head)
      from = line.from + indentOf(line.text).length
      to = line.to
    }
    const text = doc.slice(from, to)
    const lead = text.length - text.trimStart().length
    const trail = text.length - text.trimEnd().length
    const inner = text.trim()
    if (
      inner.startsWith(open) &&
      inner.endsWith(close) &&
      inner.length >= open.length + close.length
    ) {
      const a = from + lead
      const b = to - trail
      const spaceAfter = doc.slice(a + open.length, a + open.length + 1) === ' ' ? 1 : 0
      const spaceBefore = doc.slice(b - close.length - 1, b - close.length) === ' ' ? 1 : 0
      list.push({ from: a, to: a + open.length + spaceAfter, insert: '' })
      list.push({ from: b - close.length - spaceBefore, to: b, insert: '' })
    } else {
      list.push({ from, to: from, insert: open + ' ' })
      list.push({ from: to, to, insert: ' ' + close })
    }
  }
  return withChanges(state, list, 'input.comment')
}

// Lines ----------------------------------------------------------------------

/** The selections' lines as blocks [first, last], blocks touching each other joined. */
function lineBlocks(state: EditorState): [number, number][] {
  const blocks = state.selection.ranges.map((r) => linesOf(state, r)).sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const b of blocks) {
    const last = out[out.length - 1]
    if (last && b[0] <= last[1] + 1) last[1] = Math.max(last[1], b[1])
    else out.push([b[0], b[1]])
  }
  return out
}

function moveLines(up: boolean): Command {
  return (state) => {
    const doc = state.doc
    const blocks = lineBlocks(state)
    if (up ? blocks[0]![0] === 0 : blocks[blocks.length - 1]![1] === doc.lineCount - 1) return null
    const list: Change[] = []
    const shifts: { from: number; to: number; by: number }[] = []
    for (const [a, b] of blocks) {
      const block = doc.slice(doc.lineStart(a), doc.lineEnd(b))
      if (up) {
        const other = doc.line(a - 1)
        list.push({ from: other.from, to: doc.lineEnd(b), insert: block + '\n' + other.text })
        shifts.push({ from: doc.lineStart(a), to: doc.lineEnd(b), by: -(other.text.length + 1) })
      } else {
        const other = doc.line(b + 1)
        list.push({ from: doc.lineStart(a), to: other.to, insert: other.text + '\n' + block })
        shifts.push({ from: doc.lineStart(a), to: doc.lineEnd(b), by: other.text.length + 1 })
      }
    }
    const move = (pos: number) => {
      const s = shifts.find((x) => pos >= x.from && pos <= x.to)
      return s ? pos + s.by : pos
    }
    const ranges = state.selection.ranges.map(
      (r) => new SelectionRange(move(r.anchor), move(r.head), r.goal),
    )
    return {
      changes: ChangeSet.of(list),
      selection: Selection.create(ranges, state.selection.mainIndex),
      userEvent: 'move.line',
    }
  }
}

/** Alt-ArrowUp / Alt-ArrowDown: the selected lines change places with the line above or below. */
export const moveLineUp = moveLines(true)
export const moveLineDown = moveLines(false)

function copyLines(up: boolean): Command {
  return (state) => {
    const doc = state.doc
    const blocks = lineBlocks(state)
    const list: Change[] = []
    const shifts: { from: number; to: number; by: number }[] = []
    let before = 0
    for (const [a, b] of blocks) {
      const block = doc.slice(doc.lineStart(a), doc.lineEnd(b))
      list.push({ from: doc.lineEnd(b), to: doc.lineEnd(b), insert: '\n' + block })
      // Down: the selection goes with the copy below; up: it stays on the first (the copy above it).
      shifts.push({
        from: doc.lineStart(a),
        to: doc.lineEnd(b),
        by: up ? before : before + block.length + 1,
      })
      before += block.length + 1
    }
    const move = (pos: number) => {
      const s = shifts.find((x) => pos >= x.from && pos <= x.to)
      return s ? pos + s.by : pos
    }
    const ranges = state.selection.ranges.map(
      (r) => new SelectionRange(move(r.anchor), move(r.head)),
    )
    return {
      changes: ChangeSet.of(list),
      selection: Selection.create(ranges, state.selection.mainIndex),
      userEvent: 'input.copyline',
    }
  }
}

/** Shift-Alt-ArrowUp / Shift-Alt-ArrowDown: the selected lines copied above or below. */
export const copyLineUp = copyLines(true)
export const copyLineDown = copyLines(false)

/** Mod-Shift-k: the selected lines deleted. */
export const deleteLine: Command = (state) => {
  const doc = state.doc
  const list: Change[] = []
  for (const [a, b] of lineBlocks(state)) {
    if (b < doc.lineCount - 1)
      list.push({ from: doc.lineStart(a), to: doc.lineStart(b + 1), insert: '' })
    else list.push({ from: a > 0 ? doc.lineEnd(a - 1) : 0, to: doc.lineEnd(b), insert: '' })
  }
  const changes = ChangeSet.of(list)
  const ranges = state.selection.ranges.map((r) => {
    const pos = changes.mapPos(r.head, -1)
    return SelectionRange.cursor(pos)
  })
  return {
    changes,
    selection: Selection.create(ranges, state.selection.mainIndex),
    userEvent: 'delete.line',
  }
}

function newLine(above: boolean): Command {
  return (state) => {
    const doc = state.doc
    const list: Change[] = []
    const cursors: number[] = []
    for (const r of state.selection.ranges) {
      const line = doc.lineAt(r.head)
      const indent = indentOf(line.text)
      if (above) list.push({ from: line.from, to: line.from, insert: indent + '\n' })
      else list.push({ from: line.to, to: line.to, insert: '\n' + indent })
    }
    const changes = ChangeSet.of(list)
    for (const r of state.selection.ranges) {
      const line = doc.lineAt(r.head)
      const indent = indentOf(line.text)
      cursors.push(
        above ? changes.mapPos(line.from, -1) + indent.length : changes.mapPos(line.to, 1),
      )
    }
    return {
      changes,
      selection: Selection.create(
        cursors.map((c) => SelectionRange.cursor(c)),
        state.selection.mainIndex,
      ),
      userEvent: 'input.type',
    }
  }
}

/** Mod-Enter / Mod-Shift-Enter: a new line below or above, the cursor on it. */
export const insertLineAfter = newLine(false)
export const insertLineBefore = newLine(true)

/** Mod-l: the selections grow to whole lines (again: one line more). */
export const selectLine: Command = (state) => {
  const doc = state.doc
  const ranges = state.selection.ranges.map((r) => {
    const [a, b] = linesOf(state, r)
    const whole =
      r.from === doc.lineStart(a) &&
      r.to === (b + 1 < doc.lineCount ? doc.lineStart(b + 1) : doc.length)
    const last = whole && !r.empty ? Math.min(doc.lineCount - 1, b + 1) : b
    const end = last + 1 < doc.lineCount ? doc.lineStart(last + 1) : doc.length
    return new SelectionRange(doc.lineStart(a), end)
  })
  return { selection: Selection.create(ranges, state.selection.mainIndex), userEvent: 'select' }
}

// Several cursors --------------------------------------------------------------

function addCursor(up: boolean): Command {
  return (state, context = DEFAULT_CONTEXT) => {
    const ranges = state.selection.ranges
    const edge = up ? ranges[0]! : ranges[ranges.length - 1]!
    const moved = (up ? lineUp : lineDown)(
      state,
      SelectionRange.cursor(edge.head, edge.goal),
      context,
    )
    if (
      moved.head === edge.head ||
      state.doc.lineAt(moved.head).index === state.doc.lineAt(edge.head).index
    )
      return null
    const all = [...ranges, moved]
    return {
      selection: Selection.create(all, all.length - 1),
      userEvent: 'select',
      scrollIntoView: true,
    }
  }
}

/** Mod-Alt-ArrowUp / Mod-Alt-ArrowDown: one more cursor on the line above or below. */
export const addCursorAbove = addCursor(true)
export const addCursorBelow = addCursor(false)

/** The main selection's text, or the word at an empty main cursor (null when there is none). */
function occurrenceOf(
  state: EditorState,
): { text: string; word: boolean; from: number; to: number } | null {
  const main = state.selection.main
  if (!main.empty)
    return { text: state.doc.slice(main.from, main.to), word: false, from: main.from, to: main.to }
  const [from, to] = wordAroundRange(state, main.head)
  const text = state.doc.slice(from, to)
  return WORD_CHAR.test(text) ? { text, word: true, from, to } : null
}

/** Where the text next occurs after `pos`, round past the end; -1 when nowhere else. */
function nextOccurrence(
  state: EditorState,
  text: string,
  pos: number,
  word: boolean,
  taken: (p: number) => boolean,
): number {
  const full = state.doc.toString()
  const ok = (i: number) =>
    !taken(i) &&
    (!word || (!WORD_CHAR.test(full[i - 1] ?? '') && !WORD_CHAR.test(full[i + text.length] ?? '')))
  for (let i = full.indexOf(text, pos); i >= 0; i = full.indexOf(text, i + 1)) if (ok(i)) return i
  for (let i = full.indexOf(text); i >= 0 && i < pos; i = full.indexOf(text, i + 1))
    if (ok(i)) return i
  return -1
}

/** Mod-d: the word at the cursor selected; again, its next occurrence added to the selections. */
export const selectNextOccurrence: Command = (state) => {
  const found = occurrenceOf(state)
  if (!found) return null
  const ranges = state.selection.ranges
  if (state.selection.main.empty && ranges.length === 1)
    return { selection: Selection.single(found.from, found.to), userEvent: 'select' }
  const last = ranges.reduce((m, r) => Math.max(m, r.to), 0)
  const taken = (p: number) => ranges.some((r) => r.from === p)
  const at = nextOccurrence(state, found.text, last, false, taken)
  if (at < 0) return null
  const all = [...ranges, new SelectionRange(at, at + found.text.length)]
  return {
    selection: Selection.create(all, all.length - 1),
    userEvent: 'select',
    scrollIntoView: true,
  }
}

/** Mod-Shift-l: every occurrence of the selection (or the word at the cursor) selected. */
export const selectAllOccurrences: Command = (state) => {
  const found = occurrenceOf(state)
  if (!found || found.text === '') return null
  const full = state.doc.toString()
  const ranges: SelectionRange[] = []
  let main = 0
  for (
    let i = full.indexOf(found.text);
    i >= 0;
    i = full.indexOf(found.text, i + found.text.length)
  ) {
    if (
      found.word &&
      (WORD_CHAR.test(full[i - 1] ?? '') || WORD_CHAR.test(full[i + found.text.length] ?? ''))
    )
      continue
    if (i === found.from) main = ranges.length
    ranges.push(new SelectionRange(i, i + found.text.length))
  }
  return ranges.length ? { selection: Selection.create(ranges, main), userEvent: 'select' } : null
}

/** The whole lines under empty cursors, for a copy without a selection (each with its line break). */
export function linesText(state: EditorState): string {
  const doc = state.doc
  return lineBlocks(state)
    .map(([a, b]) => doc.slice(doc.lineStart(a), doc.lineEnd(b)) + '\n')
    .join('')
}
