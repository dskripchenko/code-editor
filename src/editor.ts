/**
 * The editor on an element: the text model, input, and the lines in view.
 * Only the lines in the scrolled-to window (plus a margin) are in the page,
 * so a file of a million lines scrolls and edits as a small one; a very long
 * line (minified code) is drawn only around the columns in view.
 */
import { canValidate, foldRanges, validate, type Token } from '@dskripchenko/syntax'
import { selectedText, deleteSelection, insertText, wordAroundRange } from './commands'
import { compileKeymap, defaultKeymap, keyName, type KeyBinding } from './keymap'
import { Doc } from './state/doc'
import { History } from './state/history'
import { Selection, SelectionRange } from './state/selection'
import {
  composeLines,
  EditorState,
  type EditorConfig,
  type LineChange,
  type Transaction,
  type TransactionSpec,
} from './state/state'
import { ensureStyle } from './style'
import { detectLineBreak, type LineBreak } from './text'
import { columnAt, offsetAt } from './text-measure'
import { Diagnostics, fromValidation, type Diagnostic } from './view/diagnostics'
import { Folding, type Fold } from './view/folding'
import { fillLine, Highlighting } from './view/highlight'
import { createInput, type Input, type InputHost } from './view/input'

export interface CodeEditorOptions {
  /** The text to show. */
  value?: string
  /** The language, by its id in @dskripchenko/syntax (`typescript`, `php`…). */
  language?: string
  /** Line numbers beside the text (on by default). */
  lineNumbers?: boolean
  /** Shown and selectable, not editable. */
  readOnly?: boolean
  /** Columns a tab takes (4). */
  tabSize?: number
  /** What Tab inserts (four spaces). */
  indentUnit?: string
  /** Called after every change of the text. */
  onChange?: (editor: CodeEditor) => void
  /** How typed text is read: EditContext where the browser has it (`auto`), or always the textarea. */
  input?: 'auto' | 'textarea'
  /** Bindings before the default ones (the first one bound to a key wins). */
  keymap?: readonly KeyBinding[]
  /** Data formats (JSON, YAML, XML, TOML, CSV, INI, .env) checked as they are edited (on by default). */
  validate?: boolean
}

/** Lines drawn above and below the view, so a scroll does not show them blank. */
const BUFFER = 30
/** A line longer than this is drawn only around the columns in view. */
const LONG_LINE = 10_000
/** Columns of a long line drawn beyond the view on each side. */
const LONG_MARGIN = 2000
/** The text's left padding, in pixels (`.dsk-code-editor__lines`). */
const PAD = 4
/**
 * The scrolled height is kept under this (Firefox stops at about 17.9 million
 * pixels): a taller text scrolls through it proportionally, the lines in view
 * placed by an offset.
 */
const MAX_HEIGHT = 8_000_000
/** Folding and the check of data formats read the whole text: above this many characters, neither. */
const ANALYZE_LIMIT = 2_000_000
/** The pause after typing before they read it again, in milliseconds. */
const ANALYZE_DELAY = 300
/** The fold markers' column in the gutter, in pixels. */
const FOLD_WIDTH = 14
/** A line of printable ASCII and tabs: its columns are its pixels. */
const SIMPLE = /^[\x20-\x7e\t]*$/

export class CodeEditor {
  /** The editor's own element, inside the one it was given; it scrolls. */
  readonly dom: HTMLElement
  private readonly sizer: HTMLElement
  private readonly gutter: HTMLElement
  private readonly gutterLines: HTMLElement
  private readonly content: HTMLElement
  private readonly linesEl: HTMLElement
  private readonly selectionsEl: HTMLElement
  private readonly cursorsEl: HTMLElement
  private editorState: EditorState
  private readonly history = new History()
  private readonly config: EditorConfig
  private readonly keys: Map<string, KeyBinding>
  private readonly input: Input
  private lineBreak: LineBreak
  private lang: string | null = null
  private readOnlyFlag: boolean
  private readonly showNumbers: boolean
  private readonly onChange?: (editor: CodeEditor) => void
  private lineHeight = 20
  private charWidth = 8
  private gutterWidth = 0
  private drawn = {
    from: 0,
    to: 0,
    version: -1,
    longLeft: -1,
    settled: true,
    /** The lines drawn, in order (folded ones are not). */
    lines: [] as number[],
    marks: -1,
  }
  private readonly highlighting: Highlighting
  private readonly folding = new Folding()
  private readonly diagnosticsModel = new Diagnostics()
  private readonly validating: boolean
  /** Changes when folds or diagnostics do: the lines are drawn again. */
  private marks = 0
  private analyzeTimer = 0
  private longest = { version: -1, length: 0 }
  private composition: readonly { from: number; to: number }[] = []
  private frame = 0
  private drag: {
    origin: [number, number]
    unit: 1 | 2 | 3
    x: number
    y: number
    timer: number
  } | null = null
  private readonly resize: ResizeObserver | null
  private readonly cleanup: (() => void)[] = []

  constructor(parent: HTMLElement, options: CodeEditorOptions = {}) {
    const doc = parent.ownerDocument
    const el = (tag: string, className: string): HTMLElement => {
      const e = doc.createElement(tag)
      e.className = className
      return e
    }
    this.dom = el('div', 'dsk-code-editor')
    this.sizer = el('div', 'dsk-code-editor__sizer')
    this.gutter = el('div', 'dsk-code-editor__gutter')
    this.gutter.setAttribute('aria-hidden', 'true')
    this.gutterLines = el('div', 'dsk-code-editor__gutter-lines')
    this.gutter.append(this.gutterLines)
    this.content = el('div', 'dsk-code-editor__content')
    this.content.setAttribute('role', 'textbox')
    this.content.setAttribute('aria-multiline', 'true')
    this.linesEl = el('div', 'dsk-code-editor__lines')
    this.selectionsEl = el('div', 'dsk-code-editor__selections')
    this.cursorsEl = el('div', 'dsk-code-editor__cursors')
    this.content.append(this.selectionsEl, this.linesEl, this.cursorsEl)
    this.sizer.append(this.gutter, this.content)
    this.dom.append(this.sizer)
    parent.append(this.dom)
    ensureStyle(this.dom)

    this.showNumbers = options.lineNumbers !== false
    this.gutter.hidden = !this.showNumbers
    this.readOnlyFlag = options.readOnly ?? false
    this.content.setAttribute('aria-readonly', String(this.readOnlyFlag))
    this.onChange = options.onChange
    this.validating = options.validate !== false
    this.config = { tabSize: options.tabSize ?? 4, indentUnit: options.indentUnit ?? '    ' }
    this.linesEl.style.tabSize = String(this.config.tabSize)
    this.keys = compileKeymap([...(options.keymap ?? []), ...defaultKeymap])
    const value = options.value ?? ''
    this.lineBreak = detectLineBreak(value)
    this.editorState = new EditorState(new Doc(value), Selection.single(0), this.config)
    this.highlighting = new Highlighting(
      () => this.editorState.doc,
      doc.defaultView ?? window,
      () => {
        // Lines in view drawn from a guess: drawn again once they are settled.
        if (!this.drawn.settled && this.highlighting.settled(this.drawn.to)) {
          this.drawn.version = -1
          this.schedule()
        }
      },
    )
    this.language = options.language ?? null

    this.input = createInput(this.host(), options.input ?? 'auto')
    this.dom.dataset.input = this.input.kind

    this.measure()
    this.on(this.dom, 'scroll', () => this.schedule())
    this.on(this.content, 'mousedown', (e) => this.onMouseDown(e as MouseEvent))
    this.on(this.gutter, 'mousedown', (e) => this.onGutterDown(e as MouseEvent))
    const fonts = doc.fonts as FontFaceSet | undefined
    if (fonts) this.on(fonts, 'loadingdone', () => this.remeasure())
    this.resize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.schedule())
    this.resize?.observe(this.dom)
    this.draw()
  }

  // The API ------------------------------------------------------------------

  /** The text, with the line breaks it was given with. */
  get value(): string {
    return this.editorState.doc.toString(this.lineBreak)
  }

  /** Replaces the text: the cursor to the start, the undo history cleared. */
  set value(value: string) {
    this.lineBreak = detectLineBreak(value)
    this.editorState = new EditorState(new Doc(value), Selection.single(0), this.config)
    this.history.clear()
    this.highlighting.reset()
    this.folding.setAvailable([])
    this.diagnosticsModel.clear()
    this.analyze()
    this.drawn.version = -1
    this.dom.scrollTop = 0
    this.dom.scrollLeft = 0
    this.draw()
    this.input.sync()
  }

  /** The text and the cursors. Change them through `dispatch`. */
  get state(): EditorState {
    return this.editorState
  }

  get language(): string | null {
    return this.lang
  }

  /** Set to another language, the text is highlighted again; one not known leaves it plain. */
  set language(language: string | null) {
    this.lang = language
    if (language) this.dom.dataset.language = language
    else delete this.dom.dataset.language
    this.highlighting.setLanguage(language)
    this.drawn.version = -1
    this.analyze()
    this.schedule()
  }

  get readOnly(): boolean {
    return this.readOnlyFlag
  }

  set readOnly(readOnly: boolean) {
    this.readOnlyFlag = readOnly
    this.content.setAttribute('aria-readonly', String(readOnly))
  }

  /** How many lines the text has. */
  get lineCount(): number {
    return this.editorState.doc.lineCount
  }

  /** The cursors, as offsets into the text (line breaks count as one character). */
  get selection(): { anchor: number; head: number }[] {
    return this.editorState.selection.ranges.map((r) => ({ anchor: r.anchor, head: r.head }))
  }

  setSelection(anchor: number, head = anchor): void {
    this.dispatch({ selection: Selection.single(anchor, head), userEvent: 'select' })
  }

  /** Changes the text or the cursors; the change goes into the undo history. */
  dispatch(spec: TransactionSpec): Transaction {
    return this.apply(spec, false)
  }

  undo(): boolean {
    return this.applyAll(this.history.undo(this.editorState))
  }

  redo(): boolean {
    return this.applyAll(this.history.redo(this.editorState))
  }

  focus(): void {
    this.input.focus()
  }

  get hasFocus(): boolean {
    return this.input.hasFocus()
  }

  /** What is wrong with the text: the editor's own check, and what `setDiagnostics` gave. */
  get diagnostics(): readonly Diagnostic[] {
    this.flushAnalysis()
    return this.diagnosticsModel.list
  }

  /** Sets the diagnostics of one source (a language server, a linter); an empty list clears them. */
  setDiagnostics(list: readonly Diagnostic[], source = 'external'): void {
    if (!this.diagnosticsModel.set(source, list, this.editorState.doc.length)) return
    this.marksChanged()
    this.toldDiagnostics()
  }

  /** The folded ranges (0-based lines: the first stays in view). */
  get folds(): Fold[] {
    return this.folding.folds
  }

  /** Folds the range that starts on a line (0-based), or the innermost one around it; the main cursor's line by default. */
  fold(line = this.cursorLine()): boolean {
    this.flushAnalysis()
    const done = this.folding.fold(line)
    if (done) this.afterFold()
    return done
  }

  /** Opens the fold on or around a line (0-based); the main cursor's line by default. */
  unfold(line = this.cursorLine()): boolean {
    const done = this.folding.unfold(line)
    if (done) this.marksChanged()
    return done
  }

  foldAll(): void {
    this.flushAnalysis()
    this.folding.foldAll()
    this.afterFold()
  }

  unfoldAll(): void {
    if (this.folding.unfoldAll()) this.marksChanged()
  }

  /** Takes the editor off the page. */
  destroy(): void {
    cancelAnimationFrame(this.frame)
    this.highlighting.destroy()
    clearTimeout(this.analyzeTimer)
    this.stopDrag()
    this.resize?.disconnect()
    for (const off of this.cleanup) off()
    this.input.destroy()
    this.dom.remove()
  }

  // Changes ------------------------------------------------------------------

  private apply(spec: TransactionSpec, fromInput: boolean): Transaction {
    const tr = this.editorState.update(spec)
    this.history.record(tr)
    this.after([tr], fromInput)
    return tr
  }

  private applyAll(trs: Transaction[]): boolean {
    if (trs.length === 0) return false
    this.after(trs, false)
    return true
  }

  private after(trs: Transaction[], fromInput: boolean): void {
    let lines: LineChange | null = null
    for (const t of trs) {
      lines = composeLines(lines, t.lines)
      if (t.docChanged) this.diagnosticsModel.map(t.changes)
    }
    if (lines) {
      this.highlighting.edit(lines)
      this.folding.map(lines)
      this.marks++
      this.analyze()
    }
    // A cursor moved into folded lines opens their fold.
    const { doc, selection } = this.editorState
    if (this.folding.reveal(selection.ranges.map((r) => doc.lineAt(r.head).index))) this.marks++
    this.draw()
    if (trs.some((t) => t.scrollIntoView)) this.scrollToCursor()
    if (!fromInput) this.input.sync()
    if (trs.some((t) => t.docChanged)) {
      this.onChange?.(this)
      const value = (): string => this.value
      this.dom.dispatchEvent(
        new CustomEvent('dsk:change', {
          bubbles: true,
          detail: {
            get source() {
              return value()
            },
          },
        }),
      )
    }
  }

  private host(): InputHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const editor = this
    return {
      get state() {
        return editor.editorState
      },
      get readOnly() {
        return editor.readOnlyFlag
      },
      content: this.content,
      dispatch: (spec, fromInput) => void this.apply(spec, fromInput ?? false),
      handleKey: (e) => this.handleKey(e),
      copy: (e) => this.copy(e),
      cut: (e) => this.cut(e),
      paste: (e) => this.paste(e),
      focusChanged: (focused) => {
        this.dom.classList.toggle('dsk-code-editor--focused', focused)
        this.drawLayers()
      },
      breakHistory: () => this.history.breakGroup(),
      setComposition: (ranges) => {
        this.composition = ranges
        this.drawLayers()
      },
      charRect: (pos) => this.charRect(pos),
    }
  }

  // Keys and the clipboard ----------------------------------------------------

  private handleKey(event: KeyboardEvent): boolean {
    const binding = this.keys.get(keyName(event))
    if (!binding) return false
    const run = binding.run
    if (this.readOnlyFlag && !binding.readOnly) return false
    if (run === 'undo' || run === 'redo') {
      if (run === 'undo') this.undo()
      else this.redo()
    } else if (run === 'copy' || run === 'cut' || run === 'paste') {
      return false
    } else if (run === 'fold' || run === 'unfold') {
      if (run === 'fold') this.fold()
      else this.unfold()
    } else {
      const folding = this.folding
      const count = this.editorState.doc.lineCount
      const spec = run(this.editorState, {
        pageLines: this.pageLines(),
        rows: {
          count: folding.rowCount(count),
          rowOf: (line) => folding.rowOf(line),
          lineOf: (row) => folding.lineOf(row),
        },
      })
      if (!spec) {
        // Escape with one cursor is the page's (a dialog may close on it).
        if (event.key === 'Escape') return false
      } else this.dispatch(spec)
    }
    event.preventDefault()
    return true
  }

  private copy(event: ClipboardEvent): void {
    const text = selectedText(this.editorState)
    if (!text || !event.clipboardData) return
    event.clipboardData.setData('text/plain', text)
    event.preventDefault()
  }

  private cut(event: ClipboardEvent): void {
    this.copy(event)
    if (!event.defaultPrevented || this.readOnlyFlag) return
    const spec = deleteSelection(this.editorState, { pageLines: 0 })
    if (spec) this.dispatch(spec)
  }

  private paste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain')
    event.preventDefault()
    if (!text || this.readOnlyFlag) return
    const spec = insertText(text, 'input.paste')(this.editorState, { pageLines: 0 })
    if (spec) this.dispatch(spec)
  }

  // Measuring ----------------------------------------------------------------

  private measure(): void {
    const doc = this.dom.ownerDocument
    const probe = doc.createElement('div')
    probe.className = 'dsk-code-editor__line'
    probe.style.cssText = 'position:absolute;visibility:hidden'
    const span = doc.createElement('span')
    span.textContent = 'x'.repeat(100)
    probe.append(span)
    this.linesEl.append(probe)
    const width = span.getBoundingClientRect().width / 100
    const height = probe.getBoundingClientRect().height
    probe.remove()
    if (width > 0) this.charWidth = width
    if (height > 0) this.lineHeight = height
  }

  private remeasure(): void {
    this.measure()
    this.drawn.version = -1
    this.draw()
  }

  private pageLines(): number {
    return Math.max(1, Math.floor(this.dom.clientHeight / this.lineHeight) - 1)
  }

  /** The line's element, when it is drawn and up to date. */
  private lineElement(index: number): HTMLElement | null {
    if (
      this.drawn.version !== this.editorState.doc.version ||
      index < this.drawn.from ||
      index >= this.drawn.to
    )
      return null
    const k = this.drawnIndex(index)
    return k < 0 ? null : ((this.linesEl.children[k] as HTMLElement | undefined) ?? null)
  }

  /** Where a line is among the drawn ones; -1 when it is not drawn. */
  private drawnIndex(index: number): number {
    const lines = this.drawn.lines
    let lo = 0
    let hi = lines.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (lines[mid] === index) return mid
      if (lines[mid]! < index) lo = mid + 1
      else hi = mid - 1
    }
    return -1
  }

  /** The x of a character offset in a line, from the text's left edge. */
  private xAt(index: number, ch: number): number {
    const text = this.editorState.doc.lineText(index)
    const el = text.length > LONG_LINE || SIMPLE.test(text) ? null : this.lineElement(index)
    if (!el) return columnAt(text, ch, this.config.tabSize) * this.charWidth
    if (text === '') return 0
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let rest = ch
    let node = walker.nextNode() as Text | null
    let last: Text | null = null
    while (node) {
      if (rest < node.length) break
      rest -= node.length
      last = node
      node = walker.nextNode() as Text | null
    }
    const range = el.ownerDocument.createRange()
    const box = el.getBoundingClientRect()
    if (node) {
      range.setStart(node, rest)
      range.setEnd(node, rest + 1)
      return (range.getClientRects()[0]?.left ?? box.left) - box.left
    }
    if (!last) return 0
    range.setStart(last, last.length - 1)
    range.setEnd(last, last.length)
    return (range.getClientRects()[0]?.right ?? box.left) - box.left
  }

  /** The text offset at a point on the screen. */
  private posAtCoords(clientX: number, clientY: number): number {
    const doc = this.editorState.doc
    const box = this.content.getBoundingClientRect()
    const rows = this.folding.rowCount(doc.lineCount)
    const row = Math.max(
      0,
      Math.min(rows - 1, Math.floor((clientY - box.top - this.offsetY()) / this.lineHeight)),
    )
    const index = this.folding.lineOf(row)
    const line = doc.line(index)
    const x = clientX - box.left - PAD
    const el =
      line.text.length > LONG_LINE || SIMPLE.test(line.text) ? null : this.lineElement(index)
    let ch: number | null = null
    if (el) ch = this.domOffset(el, clientX, box.top + this.lineTop(index) + this.lineHeight / 2)
    if (ch === null) ch = offsetAt(line.text, Math.round(x / this.charWidth), this.config.tabSize)
    // Never between the halves of a surrogate pair.
    const code = line.text.charCodeAt(ch)
    if (code >= 0xdc00 && code <= 0xdfff) ch--
    return line.from + Math.max(0, Math.min(ch, line.text.length))
  }

  private domOffset(el: HTMLElement, x: number, y: number): number | null {
    const doc = el.ownerDocument as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    const box = el.getBoundingClientRect()
    if (x >= box.right) return el.textContent?.length ?? 0
    const at = doc.caretPositionFromPoint?.(x, y)
    const node = at ? at.offsetNode : doc.caretRangeFromPoint?.(x, y)?.startContainer
    const offset = at ? at.offset : (doc.caretRangeFromPoint?.(x, y)?.startOffset ?? 0)
    if (!node || !el.contains(node)) return null
    if (node === el) return offset === 0 ? 0 : (el.textContent?.length ?? 0)
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let sum = 0
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n === node) return sum + offset
      sum += (n as Text).length
    }
    return null
  }

  private charRect(pos: number): DOMRect {
    const line = this.editorState.doc.lineAt(pos)
    const box = this.content.getBoundingClientRect()
    const left = box.left + PAD + this.xAt(line.index, pos - line.from)
    const right =
      box.left + PAD + this.xAt(line.index, Math.min(line.text.length, pos - line.from + 1))
    return new DOMRect(
      left,
      box.top + this.lineTop(line.index),
      Math.max(right - left, this.charWidth),
      this.lineHeight,
    )
  }

  // Drawing ------------------------------------------------------------------

  /** Text pixels per scrolled pixel: 1, unless the text is taller than `MAX_HEIGHT`. */
  private scale(): number {
    const real = this.folding.rowCount(this.editorState.doc.lineCount) * this.lineHeight
    if (real <= MAX_HEIGHT) return 1
    const view = this.dom.clientHeight
    return (real - view) / Math.max(1, MAX_HEIGHT - view)
  }

  /** Where text pixels are placed against the scrolled ones (0 unless scaled). */
  private offsetY(): number {
    const top = this.dom.scrollTop
    return top - top * this.scale()
  }

  /** A line's top in the content's pixels. */
  private lineTop(index: number): number {
    return this.folding.rowOf(index) * this.lineHeight + this.offsetY()
  }

  private schedule(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.draw()
    })
  }

  /** The rows in view, with a margin. */
  private viewport(): { from: number; to: number } {
    const count = this.folding.rowCount(this.editorState.doc.lineCount)
    const height = this.dom.clientHeight
    if (height === 0) return { from: 0, to: Math.min(count, 2 * BUFFER) }
    const top = this.dom.scrollTop * this.scale()
    return {
      from: Math.max(0, Math.floor(top / this.lineHeight) - BUFFER),
      to: Math.min(count, Math.ceil((top + height) / this.lineHeight) + BUFFER),
    }
  }

  private draw(): void {
    const doc = this.editorState.doc
    const count = doc.lineCount
    this.gutterWidth = this.showNumbers
      ? Math.ceil(String(count).length * this.charWidth + 20 + FOLD_WIDTH)
      : 0
    this.gutter.style.width = `${this.gutterWidth}px`
    const rows = this.folding.rowCount(count)
    this.sizer.style.height = `${Math.min(rows * this.lineHeight, MAX_HEIGHT)}px`
    if (this.longest.version !== doc.version)
      this.longest = { version: doc.version, length: doc.longestLine() }
    this.content.style.minWidth = `${Math.ceil(PAD * 2 + (this.longest.length + 2) * this.charWidth)}px`

    const view = this.viewport()
    const visible = this.folding.linesOfRows(view.from, view.to, count)
    const from = visible[0] ?? 0
    const to = visible.length ? visible[visible.length - 1]! + 1 : 0
    const cols = Math.ceil(this.dom.clientWidth / this.charWidth)
    const longLeft = Math.max(0, Math.floor(this.dom.scrollLeft / this.charWidth) - LONG_MARGIN)
    const longMoved = Math.abs(longLeft - this.drawn.longLeft) > LONG_MARGIN / 2
    if (
      from !== this.drawn.from ||
      to !== this.drawn.to ||
      doc.version !== this.drawn.version ||
      this.marks !== this.drawn.marks ||
      longMoved
    ) {
      const d = this.dom.ownerDocument
      const lines = d.createDocumentFragment()
      const numbers = d.createDocumentFragment()
      const tokens = this.visibleTokens(visible)
      const marks = this.lineMarks(from, to)
      visible.forEach((i, k) => {
        const text = doc.lineText(i)
        const line = d.createElement('div')
        line.className = 'dsk-code-editor__line'
        const folded = this.folding.isFolded(i)
        if (folded) line.classList.add('dsk-code-editor__line--folded')
        const mark = marks.get(i)
        if (mark) line.title = mark.messages.join('\n')
        const row = tokens[k] ?? null
        if (text.length > LONG_LINE) {
          fillLine(line, text, row, longLeft, longLeft + cols + 2 * LONG_MARGIN)
          line.style.paddingLeft = `${longLeft * this.charWidth}px`
        } else fillLine(line, text, row)
        lines.append(line)
        if (this.showNumbers) {
          const n = d.createElement('div')
          n.className = 'dsk-code-editor__line'
          if (mark) {
            n.classList.add(`dsk-code-editor__line--${mark.severity}`)
            n.title = mark.messages.join('\n')
          }
          n.append(String(i + 1))
          if (this.folding.availableAt(i)) {
            const m = d.createElement('span')
            m.className = `dsk-code-editor__fold${folded ? ' dsk-code-editor__fold--folded' : ''}`
            m.dataset.line = String(i)
            numbers.append(n)
            n.append(m)
          } else numbers.append(n)
        }
      })
      this.linesEl.replaceChildren(lines)
      this.gutterLines.replaceChildren(numbers)
      this.drawn = {
        from,
        to,
        version: doc.version,
        longLeft,
        settled: this.highlighting.settled(to),
        lines: visible,
        marks: this.marks,
      }
    }
    this.linesEl.style.transform = `translateY(${this.lineTop(from)}px)`
    this.gutterLines.style.transform = this.linesEl.style.transform
    this.drawLayers()
  }

  /** Selections, cursors, the active line and the composition underline. */
  private drawLayers(): void {
    const { doc, selection } = this.editorState
    const d = this.dom.ownerDocument
    const { from: first, to: last } = this.drawn
    const lh = this.lineHeight
    const selections = d.createDocumentFragment()
    const cursors = d.createDocumentFragment()
    const rect = (
      className: string,
      left: number,
      top: number,
      width: number,
      height = lh,
    ): HTMLElement => {
      const e = d.createElement('div')
      e.className = className
      e.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px`
      return e
    }
    const active = new Set<number>()
    for (const r of selection.ranges) {
      const a = doc.lineAt(r.from)
      const b = r.empty ? a : doc.lineAt(r.to)
      if (r.empty) active.add(a.index)
      for (let i = Math.max(first, a.index); i <= Math.min(last - 1, b.index) && !r.empty; i++) {
        if (this.folding.isHidden(i)) continue
        const line = i === a.index ? a : i === b.index ? b : doc.line(i)
        const x1 = i === a.index ? this.xAt(i, r.from - a.from) : 0
        const x2 =
          i === b.index
            ? this.xAt(i, r.to - b.from)
            : this.xAt(i, line.text.length) + this.charWidth / 2
        selections.append(
          rect('dsk-code-editor__selection', PAD + x1, this.lineTop(i), Math.max(0, x2 - x1)),
        )
      }
      const head = r.head === r.from ? a : b
      if (head.index >= first && head.index < last) {
        cursors.append(
          rect(
            'dsk-code-editor__cursor',
            PAD + this.xAt(head.index, r.head - head.from),
            this.lineTop(head.index),
            2,
          ),
        )
      }
    }
    for (const i of active)
      if (i >= first && i < last)
        selections.prepend(rect('dsk-code-editor__active-line', 0, this.lineTop(i), 0))
    for (const g of this.diagnosticsModel.list) {
      if (g.to < doc.lineStart(first) || (last < doc.lineCount && g.from > doc.lineStart(last)))
        continue
      const a = doc.lineAt(g.from)
      const b = doc.lineAt(g.to)
      for (let i = Math.max(first, a.index); i <= Math.min(last - 1, b.index); i++) {
        if (this.folding.isHidden(i)) continue
        const line = i === a.index ? a : i === b.index ? b : doc.line(i)
        const x1 = i === a.index ? this.xAt(i, g.from - a.from) : 0
        let x2 = i === b.index ? this.xAt(i, g.to - b.from) : this.xAt(i, line.text.length)
        // An empty range (an error at the end of the text): a mark a character wide.
        if (x2 - x1 < 2) x2 = x1 + this.charWidth
        cursors.append(
          rect(
            `dsk-code-editor__diagnostic dsk-code-editor__diagnostic--${g.severity}`,
            PAD + x1,
            this.lineTop(i) + lh - 4,
            x2 - x1,
            4,
          ),
        )
      }
    }
    for (const c of this.composition) {
      const a = doc.lineAt(c.from)
      if (a.index < first || a.index >= last || c.to <= c.from) continue
      const x1 = this.xAt(a.index, c.from - a.from)
      const x2 = this.xAt(a.index, Math.min(c.to, a.to) - a.from)
      cursors.append(
        rect('dsk-code-editor__composition', PAD + x1, this.lineTop(a.index), x2 - x1, lh - 1),
      )
    }
    this.selectionsEl.replaceChildren(selections)
    this.cursorsEl.replaceChildren(cursors)
    const numbers = this.gutterLines.children
    for (let i = 0; i < numbers.length; i++)
      numbers[i]!.classList.toggle(
        'dsk-code-editor__line--active',
        active.has(this.drawn.lines[i] ?? -1),
      )

    // The input sits at the main cursor: the IME's window opens there.
    const main = selection.main
    const line = doc.lineAt(main.head)
    const local = {
      left: PAD + this.xAt(line.index, main.head - line.from),
      top: this.lineTop(line.index),
    }
    const box = this.content.getBoundingClientRect()
    this.input.place(
      new DOMRect(box.left + local.left, box.top + local.top, 1, lh),
      this.dom.getBoundingClientRect(),
      local,
    )
  }

  private scrollToCursor(): void {
    const { doc, selection } = this.editorState
    const head = selection.main.head
    const line = doc.lineAt(head)
    const lh = this.lineHeight
    const top = this.folding.rowOf(line.index) * lh
    const { scrollTop, clientHeight, scrollLeft, clientWidth } = this.dom
    // In the text's own pixels (a scaled scroll is converted back at the end).
    const scale = this.scale()
    const virtual = scrollTop * scale
    let y = scrollTop
    if (top < virtual) y = top / scale
    else if (top + lh > virtual + clientHeight) y = (top + lh - clientHeight) / scale
    const x = PAD + this.xAt(line.index, head - line.from)
    const visible = clientWidth - this.gutterWidth
    let left = scrollLeft
    if (x < scrollLeft + this.charWidth) left = Math.max(0, x - 4 * this.charWidth)
    else if (x > scrollLeft + visible - 2 * this.charWidth) left = x - visible + 4 * this.charWidth
    if (y !== scrollTop || left !== scrollLeft) {
      this.dom.scrollTop = y
      this.dom.scrollLeft = left
      this.draw()
    }
  }

  /** Tokens of the drawn lines, a run of lines next to each other at a time (never the folded ones). */
  private visibleTokens(lines: readonly number[]): (readonly Token[] | null)[] {
    if (!this.highlighting.active) return []
    const out: (readonly Token[] | null)[] = []
    let k = 0
    while (k < lines.length) {
      let end = k + 1
      while (end < lines.length && lines[end] === lines[end - 1]! + 1) end++
      const rows = this.highlighting.tokens(lines[k]!, lines[end - 1]! + 1) ?? []
      for (const r of rows) out.push(r)
      k = end
    }
    return out
  }

  /** The diagnostics on lines `from` to `to`, by line: the worst severity and the messages. */
  private lineMarks(
    from: number,
    to: number,
  ): Map<number, { severity: Diagnostic['severity']; messages: string[] }> {
    const out = new Map<number, { severity: Diagnostic['severity']; messages: string[] }>()
    const doc = this.editorState.doc
    const rank = { error: 2, warning: 1, info: 0 }
    for (const g of this.diagnosticsModel.list) {
      const line = doc.lineAt(g.from).index
      if (line < from || line >= to) continue
      const mark = out.get(line)
      if (!mark) out.set(line, { severity: g.severity, messages: [g.message] })
      else {
        mark.messages.push(g.message)
        if (rank[g.severity] > rank[mark.severity]) mark.severity = g.severity
      }
    }
    return out
  }

  private cursorLine(): number {
    const { doc, selection } = this.editorState
    return doc.lineAt(selection.main.head).index
  }

  /** Folded: cursors inside the fold go to its first line. */
  private afterFold(): void {
    const { doc, selection } = this.editorState
    if (selection.ranges.some((r) => this.folding.isHidden(doc.lineAt(r.head).index))) {
      const ranges = selection.ranges.map((r) => {
        const index = doc.lineAt(r.head).index
        if (!this.folding.isHidden(index)) return r
        let start = index
        while (start > 0 && this.folding.isHidden(start)) start--
        return SelectionRange.cursor(doc.lineEnd(start))
      })
      this.editorState.selection = Selection.create(ranges, selection.mainIndex)
      this.input.sync()
    }
    this.marksChanged()
  }

  private marksChanged(): void {
    this.marks++
    this.draw()
  }

  /**
   * Folds and the check of data formats, read from the whole text a moment
   * after it changes (at once with `now`).
   */
  private analyze(now = false): void {
    clearTimeout(this.analyzeTimer)
    const run = (): void => {
      this.analyzeTimer = 0
      const doc = this.editorState.doc
      const lang = this.highlighting.active ? this.lang : null
      const big = doc.length > ANALYZE_LIMIT
      const text = lang && !big ? doc.toString() : ''
      this.folding.setAvailable(
        text ? foldRanges(text, lang!).map((r) => ({ start: r.start - 1, end: r.end - 1 })) : [],
      )
      this.marks++
      this.schedule()
      if (this.validating) {
        const found = text && canValidate(lang!) ? fromValidation(doc, validate(text, lang!)) : []
        if (this.diagnosticsModel.set('syntax', found, doc.length)) this.toldDiagnostics()
      }
    }
    if (now) run()
    else this.analyzeTimer = setTimeout(run, ANALYZE_DELAY) as unknown as number
  }

  /** What is waiting to be read again, read now. */
  private flushAnalysis(): void {
    if (this.analyzeTimer) this.analyze(true)
  }

  private toldDiagnostics(): void {
    this.dom.dispatchEvent(
      new CustomEvent('dsk:diagnostics', {
        bubbles: true,
        detail: { diagnostics: this.diagnosticsModel.list },
      }),
    )
  }

  private onGutterDown(event: MouseEvent): void {
    const marker = (event.target as Element).closest?.(
      '.dsk-code-editor__fold',
    ) as HTMLElement | null
    if (!marker || event.button !== 0) return
    event.preventDefault()
    const line = Number(marker.dataset.line)
    if (this.folding.isFolded(line)) this.unfold(line)
    else this.fold(line)
  }

  // The pointer --------------------------------------------------------------

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return
    event.preventDefault()
    this.input.focus()
    const pos = this.posAtCoords(event.clientX, event.clientY)
    // A click on a folded line's placeholder, past its text: the fold opens.
    const at = this.editorState.doc.lineAt(pos)
    if (this.folding.isFolded(at.index) && pos === at.to) {
      const box = this.content.getBoundingClientRect()
      if (event.clientX > box.left + PAD + this.xAt(at.index, at.text.length) + 4) {
        this.unfold(at.index)
        return
      }
    }
    const unit = (((Math.max(1, event.detail) - 1) % 3) + 1) as 1 | 2 | 3
    const origin = this.unitAround(pos, unit)
    const state = this.editorState
    let selection: Selection
    if (event.shiftKey)
      selection = Selection.create([new SelectionRange(state.selection.main.anchor, pos)], 0)
    else if (event.altKey) {
      const ranges = [...state.selection.ranges, new SelectionRange(origin[0], origin[1])]
      selection = Selection.create(ranges, ranges.length - 1)
    } else selection = Selection.single(origin[0], origin[1])
    this.apply({ selection, userEvent: 'select.pointer', scrollIntoView: false }, false)
    if (event.altKey) return
    const anchorFixed = event.shiftKey ? state.selection.main.anchor : null
    this.drag = {
      origin: anchorFixed === null ? origin : [anchorFixed, anchorFixed],
      unit,
      x: event.clientX,
      y: event.clientY,
      timer: 0,
    }
    const move = (e: MouseEvent): void => {
      if (!this.drag) return
      this.drag.x = e.clientX
      this.drag.y = e.clientY
      this.dragTo()
    }
    const up = (): void => this.stopDrag()
    const win = this.dom.ownerDocument.defaultView ?? window
    win.addEventListener('mousemove', move)
    win.addEventListener('mouseup', up, { once: true })
    this.dragOff = () => {
      win.removeEventListener('mousemove', move)
      win.removeEventListener('mouseup', up)
    }
  }

  private dragOff: (() => void) | null = null

  private dragTo(): void {
    const drag = this.drag
    if (!drag) return
    const pos = this.posAtCoords(drag.x, drag.y)
    const [a, b] = drag.origin
    const [from, to] = this.unitAround(pos, drag.unit)
    const selection = pos < a ? Selection.single(b, from) : Selection.single(a, Math.max(to, b))
    if (!selection.eq(this.editorState.selection))
      this.apply({ selection, userEvent: 'select.pointer', scrollIntoView: false }, false)
    // Past the edge: the view scrolls while the button is held.
    const box = this.dom.getBoundingClientRect()
    const dy = drag.y < box.top ? drag.y - box.top : drag.y > box.bottom ? drag.y - box.bottom : 0
    const dx =
      drag.x < box.left + this.gutterWidth
        ? drag.x - box.left - this.gutterWidth
        : drag.x > box.right
          ? drag.x - box.right
          : 0
    cancelAnimationFrame(drag.timer)
    if (dx || dy) {
      drag.timer = requestAnimationFrame(() => {
        this.dom.scrollTop += dy
        this.dom.scrollLeft += dx
        this.draw()
        this.dragTo()
      })
    }
  }

  private stopDrag(): void {
    if (this.drag) cancelAnimationFrame(this.drag.timer)
    this.drag = null
    this.dragOff?.()
    this.dragOff = null
  }

  /** A click's range: the point, the word around it, or its line. */
  private unitAround(pos: number, unit: 1 | 2 | 3): [number, number] {
    if (unit === 1) return [pos, pos]
    const doc = this.editorState.doc
    const line = doc.lineAt(pos)
    if (unit === 3) return [line.from, Math.min(doc.length, line.to + 1)]
    return wordAroundRange(this.editorState, pos)
  }

  private on(target: EventTarget, name: string, fn: (e: Event) => void): void {
    target.addEventListener(name, fn)
    this.cleanup.push(() => target.removeEventListener(name, fn))
  }
}
