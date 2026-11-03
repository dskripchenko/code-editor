/**
 * The editor on an element: the text model, input, and the lines in view.
 * Only the lines in the scrolled-to window (plus a margin) are in the page,
 * so a file of a million lines scrolls and edits as a small one; a very long
 * line (minified code) is drawn only around the columns in view.
 */
import { canValidate, foldRanges, validate, type Token } from '@dskripchenko/syntax'
import {
  deleteLine,
  deleteSelection,
  insertText,
  linesText,
  selectedText,
  typeText,
  wordAroundRange,
  type CommandContext,
} from './commands'
import { detectIndent } from './editorconfig'
import { languageEditing } from './language'
import {
  findFrom,
  matchesIn,
  replacementFor,
  searchPattern,
  type Match,
  type SearchQuery,
} from './search'
import {
  CompletionList,
  wordBefore,
  wordsOf,
  type CompletionItem,
  type CompletionSource,
} from './view/completion'
import { GoToLine } from './view/panel'
import {
  expandSnippet,
  openMenu,
  openPrompt,
  Tooltip,
  type MenuItem,
  type PopupContent,
} from './view/popups'
import { compileKeymap, defaultKeymap, isMac, keyName, type KeyBinding } from './keymap'
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
import { Gutter, type Annotation, type GutterMark } from './view/gutter'
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
  /** Brackets and quotes closed as they are typed (on by default). */
  closeBrackets?: boolean
  /** The page's suggestions for completion, besides the text's own words. */
  completion?: CompletionSource
  /** The words of the text offered as completions (on by default). */
  completeWords?: boolean
  /** What is under the pointer resting on the text (a name's type, its documentation); null for nothing. */
  hover?: (context: {
    state: EditorState
    pos: number
  }) => PopupContent | null | Promise<PopupContent | null>
  /** A call's parameters, after `(` and `,` (and Mod+Shift+Space); null for none. */
  signatureHelp?: (context: {
    state: EditorState
    pos: number
    explicit: boolean
  }) => PopupContent | null | Promise<PopupContent | null>
  /** A click with Cmd (macOS) or Ctrl: the page's (going to a definition); true when it took it. */
  onModClick?: (pos: number) => boolean
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
  private config: EditorConfig
  private readonly keys: Map<string, KeyBinding>
  private readonly input: Input
  private eol: LineBreak
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
  private readonly gutterExtras = new Gutter()
  private readonly diagnosticsModel = new Diagnostics()
  private readonly validating: boolean
  /** Changes when folds or diagnostics do: the lines are drawn again. */
  private marks = 0
  private analyzeTimer = 0
  private languageId: string | null = null
  private configured: { tabSize: boolean; indentUnit: boolean }
  private readonly closeBrackets: boolean
  private readonly completionSource?: CompletionSource
  private readonly completeWords: boolean
  private readonly completion: CompletionList
  private completionRequest = 0
  private readonly goToLinePanel: GoToLine
  private readonly hoverTip: Tooltip
  private readonly signatureTip: Tooltip
  private readonly hoverSource?: CodeEditorOptions['hover']
  private readonly signatureSource?: CodeEditorOptions['signatureHelp']
  private readonly onModClick?: CodeEditorOptions['onModClick']
  private hoverTimer = 0
  private hoverAt = -1
  private popupRequest = 0
  private query: SearchQuery | null = null
  private pattern: RegExp | null = null
  /** The text of the last copy of whole lines (no selection): pasted, it goes above the line. */
  private lineClip: string | null = null
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
  /** What the lines and characters measure (see `measure`). */
  private readonly ruler: HTMLElement
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
    this.ruler = el('div', 'dsk-code-editor__ruler')
    this.ruler.setAttribute('aria-hidden', 'true')
    const sample = this.ruler.ownerDocument.createElement('span')
    sample.textContent = 'x'.repeat(100)
    this.ruler.append(sample)
    this.content.append(this.selectionsEl, this.linesEl, this.cursorsEl, this.ruler)
    this.sizer.append(this.gutter, this.content)
    this.dom.append(this.sizer)
    parent.append(this.dom)
    ensureStyle(this.dom)
    this.completion = new CompletionList(this.content, (item) => this.acceptCompletion(item))
    this.hoverTip = new Tooltip(this.content, 'dsk-code-editor__hover')
    this.signatureTip = new Tooltip(this.content, 'dsk-code-editor__signature')
    this.hoverSource = options.hover
    this.signatureSource = options.signatureHelp
    this.onModClick = options.onModClick
    this.goToLinePanel = new GoToLine(
      this.dom,
      (line, column) => this.goToLine(line, column),
      () => this.focus(),
    )

    this.showNumbers = options.lineNumbers !== false
    this.gutter.hidden = !this.showNumbers
    this.readOnlyFlag = options.readOnly ?? false
    this.content.setAttribute('aria-readonly', String(this.readOnlyFlag))
    this.onChange = options.onChange
    this.validating = options.validate !== false
    this.configured = {
      tabSize: options.tabSize !== undefined,
      indentUnit: options.indentUnit !== undefined,
    }
    this.closeBrackets = options.closeBrackets !== false
    this.completionSource = options.completion
    this.completeWords = options.completeWords !== false
    this.config = {
      tabSize: options.tabSize ?? 4,
      indentUnit: options.indentUnit ?? detectIndent(options.value ?? '') ?? '    ',
    }
    this.linesEl.style.tabSize = String(this.config.tabSize)
    this.keys = compileKeymap([...(options.keymap ?? []), ...defaultKeymap])
    const value = options.value ?? ''
    this.eol = detectLineBreak(value)
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
    this.on(this.content, 'mousemove', (e) => this.onHoverMove(e as MouseEvent))
    this.on(this.content, 'mouseleave', () => this.hoverLater(null))
    this.on(this.gutter, 'mousedown', (e) => this.onGutterDown(e as MouseEvent))
    const fonts = doc.fonts as FontFaceSet | undefined
    if (fonts) this.on(fonts, 'loadingdone', () => this.remeasure())
    this.resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            // Made outside the page (or hidden), or its line height or font changed (the ruler's
            // size did): measured again, the lines drawn at their new places.
            const before = [this.lineHeight, this.charWidth]
            this.measure()
            if (this.lineHeight !== before[0] || this.charWidth !== before[1]) this.drawn.version = -1
            this.schedule()
          })
    this.resize?.observe(this.dom)
    this.resize?.observe(this.ruler)
    this.draw()
  }

  // The API ------------------------------------------------------------------

  /** The text, with the line breaks it was given with. */
  get value(): string {
    return this.editorState.doc.toString(this.eol)
  }

  /** Replaces the text: the cursor to the start, the undo history cleared. */
  set value(value: string) {
    this.eol = detectLineBreak(value)
    if (!this.configured.indentUnit)
      this.config = { ...this.config, indentUnit: detectIndent(value) ?? this.config.indentUnit }
    this.completion.close()
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

  /** The text's line break, as it came (`\n` or `\r\n`). */
  get lineBreak(): LineBreak {
    return this.eol
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
    this.languageId = this.highlighting.setLanguage(language)
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

  /** What Tab inserts and a tab's width (from `.editorconfig`, say: see `editorConfigFor`). */
  configure(config: { tabSize?: number; indentUnit?: string }): void {
    if (config.tabSize !== undefined) this.configured.tabSize = true
    if (config.indentUnit !== undefined) this.configured.indentUnit = true
    this.config = { ...this.config, ...config }
    const { doc, selection } = this.editorState
    this.editorState = new EditorState(doc, selection, this.config)
    this.linesEl.style.tabSize = String(this.config.tabSize)
    this.drawn.version = -1
    this.draw()
  }

  /** What Tab inserts and a tab's width, as in use (guessed from the text when not given). */
  get indentation(): { tabSize: number; indentUnit: string } {
    return { ...this.config }
  }

  /** The cursor to a line and column (both from 1, as people count them); the view follows. */
  goToLine(line: number, column = 1): void {
    const doc = this.editorState.doc
    const index = Math.max(0, Math.min(doc.lineCount - 1, Math.floor(line) - 1))
    const text = doc.lineText(index)
    const pos = doc.lineStart(index) + Math.max(0, Math.min(text.length, Math.floor(column) - 1))
    this.dispatch({ selection: Selection.single(pos), userEvent: 'select', scrollIntoView: true })
    this.centerCursor()
    this.focus()
  }

  /** The field to type a line into (Ctrl+G). */
  openGoToLine(): void {
    const doc = this.editorState.doc
    const line = doc.lineAt(this.editorState.selection.main.head)
    this.goToLinePanel.show(
      `${line.index + 1}:${this.editorState.selection.main.head - line.from + 1} — 1–${doc.lineCount}`,
    )
  }

  /** Sets what is searched for (null for nothing): the matches are marked in the text. */
  setSearch(query: SearchQuery | null): void {
    this.query = query && query.search ? query : null
    this.pattern = this.query ? searchPattern(this.query) : null
    this.drawLayers()
  }

  get search(): SearchQuery | null {
    return this.query
  }

  /** The matches of the search, up to `limit` (counting them reads the whole text). */
  searchMatches(limit = 10_000): Match[] {
    if (!this.pattern) return []
    const doc = this.editorState.doc
    return matchesIn(doc, this.pattern, 0, doc.lineCount, limit)
  }

  /** The next match after the cursor selected (round past the end); without a search, the selection's text is searched for. */
  findNext(): boolean {
    return this.find(false)
  }

  findPrevious(): boolean {
    return this.find(true)
  }

  /** The selected match replaced, and the next one selected; false when there is no match. */
  replaceNext(): boolean {
    if (!this.pattern || !this.query || this.readOnlyFlag) return false
    const main = this.editorState.selection.main
    const doc = this.editorState.doc
    const here = matchesIn(
      doc,
      this.pattern,
      doc.lineAt(main.from).index,
      doc.lineAt(main.from).index + 1,
    )
    const match = here.find((m) => m.from === main.from && m.to === main.to)
    if (match) {
      const insert = replacementFor(doc, this.pattern, this.query, match)
      this.dispatch({
        changes: { from: match.from, to: match.to, insert },
        selection: Selection.single(match.from + insert.length),
        userEvent: 'input.replace',
      })
    }
    return this.find(false) || !!match
  }

  /** Every match replaced, as one step to undo; how many. */
  replaceAll(): number {
    if (!this.pattern || !this.query || this.readOnlyFlag) return 0
    const doc = this.editorState.doc
    const matches = matchesIn(doc, this.pattern, 0, doc.lineCount)
    if (matches.length === 0) return 0
    const changes = matches.map((m) => ({
      from: m.from,
      to: m.to,
      insert: replacementFor(doc, this.pattern!, this.query!, m),
    }))
    this.dispatch({ changes, userEvent: 'input.replace' })
    return matches.length
  }

  /** Completion opened at the cursor, as Ctrl+Space does. */
  startCompletion(): void {
    void this.complete(true)
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

  /**
   * Marks beside lines, one set per source (a diff against the last commit,
   * say): `kind` gives the look — `added`, `modified` and `deleted` are drawn.
   * A click on one sends `dsk:gutter-mark` with the mark. An empty list clears.
   */
  setGutterMarks(marks: readonly GutterMark[], source = 'external'): void {
    this.gutterExtras.setMarks(source, marks)
    this.marksChanged()
  }

  /**
   * A column of short text by the line numbers (who changed a line, and when);
   * null takes it away. A click on one sends `dsk:annotation` with it.
   */
  setAnnotations(list: readonly Annotation[] | null): void {
    this.gutterExtras.setAnnotations(list)
    this.marksChanged()
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

  /** A position's box on the screen (a character's, or a cursor's width at a line's end). */
  coordsAt(pos: number): DOMRect {
    return this.charRect(Math.max(0, Math.min(this.editorState.doc.length, pos)))
  }

  /** The position at a point on the screen. */
  posAtPoint(clientX: number, clientY: number): number {
    return this.posAtCoords(clientX, clientY)
  }

  /** The page's own tooltip by a position (above it when there is room); `closeTooltip` takes it away. */
  showTooltip(content: PopupContent, pos: number): void {
    this.hoverTip.show(content, this.localAt(pos), true)
  }

  closeTooltip(): void {
    this.hoverTip.close()
  }

  /** A list at a position (the cursor by default); the index chosen, or null. */
  menu(
    items: readonly MenuItem[],
    pos = this.editorState.selection.main.head,
  ): Promise<number | null> {
    const at = this.localAt(pos)
    return openMenu(this.content, items, { left: at.left, top: at.bottom + 2 }).finally(() =>
      this.focus(),
    )
  }

  /** A field over a range of the text (a word to rename), holding `value`; what was typed, or null. */
  prompt(
    from: number,
    to: number,
    value = this.editorState.doc.slice(from, to),
  ): Promise<string | null> {
    const at = this.localAt(from)
    void to
    return openPrompt(this.content, value, {
      left: at.left - 2,
      top: at.top,
      height: this.lineHeight,
    }).finally(() => this.focus())
  }

  /** Takes the editor off the page. */
  destroy(): void {
    cancelAnimationFrame(this.frame)
    this.highlighting.destroy()
    clearTimeout(this.analyzeTimer)
    clearTimeout(this.hoverTimer)
    this.completionRequest++
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
      this.gutterExtras.map(lines)
      this.marks++
      this.analyze()
    }
    // Completion follows typing; anything else closes it.
    if (
      this.completion.open &&
      !trs.every((t) => t.userEvent === 'input.type' || t.userEvent === 'delete.backward')
    )
      this.completion.close()
    // A cursor moved into folded lines opens their fold.
    const { doc, selection } = this.editorState
    if (this.folding.reveal(selection.ranges.map((r) => doc.lineAt(r.head).index))) this.marks++
    this.draw()
    if (trs.some((t) => t.scrollIntoView)) this.scrollToCursor()
    if (!fromInput) this.input.sync()
    // The cursors moved (or the text under them changed): `dsk:selection`, for a status line.
    if (trs.some((t) => t.docChanged || !t.selection.eq(t.selectionBefore)))
      this.dom.dispatchEvent(
        new CustomEvent('dsk:selection', {
          bubbles: true,
          detail: { selection: this.selection },
        }),
      )
    if (trs.some((t) => t.docChanged)) {
      this.onChange?.(this)
      const value = (): string => this.value
      const edits = trs.flatMap((t) => t.edits)
      this.dom.dispatchEvent(
        new CustomEvent('dsk:change', {
          bubbles: true,
          detail: {
            get source() {
              return value()
            },
            // The changes as line and character ranges, in order (each against the text the one before left).
            edits,
          },
        }),
      )
    }
    // The text or the cursor moved: the tooltips go (the parameters' follow the cursor within its call).
    // Other transactions (marks, diagnostics) leave them.
    const moved = trs.some((t) => t.docChanged || !t.selection.eq(t.selectionBefore))
    if (moved && this.hoverTip.open) this.hoverTip.close()
    if (
      moved &&
      this.signatureTip.open &&
      !trs.every((t) => t.userEvent === 'input.type' || t.userEvent === 'delete.backward')
    )
      this.signatureTip.close()
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
      type: (text) => this.type(text),
      handleKey: (e) => this.handleKey(e),
      copy: (e) => this.copy(e),
      cut: (e) => this.cut(e),
      paste: (e) => this.paste(e),
      focusChanged: (focused) => {
        this.dom.classList.toggle('dsk-code-editor--focused', focused)
        if (!focused) this.completion.close()
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
    if (this.completion.open && this.completionKey(event)) {
      event.preventDefault()
      return true
    }
    // Escape takes a tooltip away first.
    if (event.key === 'Escape' && (this.hoverTip.open || this.signatureTip.open)) {
      this.hoverTip.close()
      this.signatureTip.close()
      event.preventDefault()
      return true
    }
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
    } else if (run === 'goToLine') {
      this.openGoToLine()
    } else if (run === 'findNext' || run === 'findPrevious') {
      this.find(run === 'findPrevious')
    } else if (run === 'complete') {
      void this.complete(true)
    } else if (run === 'signatureHelp') {
      if (!this.signatureSource) return false
      void this.signature(true)
    } else if (run === 'jumpToBracket') {
      const pair = this.bracketPair()
      if (!pair) return false
      const head = this.editorState.selection.main.head
      const target = pair[0] === head || pair[0] + 1 === head ? pair[1] : pair[0]
      this.dispatch({ selection: Selection.single(target), userEvent: 'select' })
    } else {
      const spec = run(this.editorState, this.commandContext())
      if (!spec) {
        // Escape with one cursor is the page's (a dialog may close on it).
        if (event.key === 'Escape') return false
      } else this.dispatch(spec)
    }
    event.preventDefault()
    return true
  }

  private copy(event: ClipboardEvent): void {
    if (!event.clipboardData) return
    const whole = this.editorState.selection.ranges.every((r) => r.empty)
    // No selection: the cursors' whole lines.
    const text = whole ? linesText(this.editorState) : selectedText(this.editorState)
    if (!text) return
    this.lineClip = whole ? text : null
    event.clipboardData.setData('text/plain', text)
    event.preventDefault()
  }

  private cut(event: ClipboardEvent): void {
    const whole = this.editorState.selection.ranges.every((r) => r.empty)
    this.copy(event)
    if (!event.defaultPrevented || this.readOnlyFlag) return
    const spec = (whole ? deleteLine : deleteSelection)(this.editorState, { pageLines: 0 })
    if (spec) this.dispatch({ ...spec, userEvent: 'delete.cut' })
  }

  private paste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain')
    event.preventDefault()
    if (!text || this.readOnlyFlag) return
    const state = this.editorState
    const ranges = state.selection.ranges
    // Lines copied whole go above the cursor's line, the cursor staying where it is.
    if (
      this.lineClip !== null &&
      text.replace(/\r\n?/g, '\n') === this.lineClip &&
      ranges.every((r) => r.empty)
    ) {
      const doc = state.doc
      const starts = [...new Set(ranges.map((r) => doc.lineAt(r.head).from))]
      this.dispatch({
        changes: starts.map((from) => ({ from, to: from, insert: this.lineClip! })),
        userEvent: 'input.paste',
      })
      return
    }
    const spec = insertText(text, 'input.paste')(state, { pageLines: 0 })
    if (spec) this.dispatch(spec)
  }

  private commandContext(): CommandContext {
    const folding = this.folding
    const count = this.editorState.doc.lineCount
    return {
      pageLines: this.pageLines(),
      rows: {
        count: folding.rowCount(count),
        rowOf: (line) => folding.rowOf(line),
        lineOf: (row) => folding.lineOf(row),
      },
      language: languageEditing(this.languageId),
    }
  }

  /** Text typed (not composed): brackets and quotes pair up, completion follows the word. */
  private type(text: string): void {
    if (this.readOnlyFlag) return
    const command = this.closeBrackets ? typeText(text) : insertText(text)
    const spec = command(this.editorState, this.commandContext())
    if (spec) this.apply(spec, false)
    if (/^[\p{L}\p{N}_$]$/u.test(text) || (this.completion.open && text === '.'))
      void this.complete(false)
    else if (this.completion.open) this.completion.close()
    // A call's parameters: shown after its `(` and `,`, gone after its `)`.
    if (this.signatureSource && (text === '(' || text === ',')) void this.signature(false)
    else if (text === ')') this.signatureTip.close()
    else if (this.signatureTip.open) void this.signature(false)
  }

  // Completion -----------------------------------------------------------------

  private async complete(explicit: boolean): Promise<void> {
    const state = this.editorState
    const main = state.selection.main
    if (!main.empty) return
    const word = wordBefore(state, main.head)
    if (!explicit && word.text.length < 2) {
      this.completion.close()
      return
    }
    const context = { state, pos: main.head, prefix: word.text, from: word.from, explicit }
    const request = ++this.completionRequest
    let items: CompletionItem[] = []
    if (this.completionSource) {
      try {
        const got = await this.completionSource(context)
        if (got) items = [...got]
      } catch {
        // A failing source gives nothing; the words still do.
      }
    }
    if (request !== this.completionRequest || this.editorState.selection.main.head !== main.head)
      return
    if (this.completeWords) {
      const known = new Set(items.map((i) => i.label))
      for (const w of wordsOf(context)) if (!known.has(w.label)) items.push(w)
    }
    const lower = word.text.toLowerCase()
    items = items.filter((i) => i.label.toLowerCase().startsWith(lower) && i.label !== word.text)
    if (items.length === 0) return this.completion.close()
    const line = state.doc.lineAt(word.from)
    this.completion.show(items.slice(0, 100), context, {
      left: PAD + this.xAt(line.index, word.from - line.from),
      top: this.lineTop(line.index) + this.lineHeight,
    })
  }

  /** The keys the open list takes: moves, picking, closing. */
  private completionKey(event: KeyboardEvent): boolean {
    if (event.altKey || event.ctrlKey || event.metaKey) return false
    switch (event.key) {
      case 'ArrowDown':
        this.completion.move(1)
        return true
      case 'ArrowUp':
        this.completion.move(-1)
        return true
      case 'PageDown':
        this.completion.move(8)
        return true
      case 'PageUp':
        this.completion.move(-8)
        return true
      case 'Enter':
      case 'Tab': {
        const item = this.completion.selected
        if (!item) return false
        this.acceptCompletion(item)
        return true
      }
      case 'Escape':
        this.completion.close()
        return true
    }
    return false
  }

  private acceptCompletion(item: CompletionItem): void {
    const context = this.completion.context
    this.completion.close()
    if (!context || this.readOnlyFlag) return
    const state = this.editorState
    // A range of its own, or a snippet: at the main cursor, its first place selected.
    if (item.snippet !== undefined || item.from !== undefined) {
      const head = state.selection.main.head
      const from = item.from ?? head - context.prefix.length
      const to = Math.max(item.to ?? head, head)
      const expanded = item.snippet !== undefined ? expandSnippet(item.snippet) : null
      const text = expanded ? expanded.text : (item.insert ?? item.label)
      this.dispatch({
        changes: { from, to, insert: text },
        selection: expanded
          ? Selection.single(from + expanded.select[0], from + expanded.select[1])
          : Selection.single(from + text.length),
        userEvent: 'input.complete',
      })
      return
    }
    const insert = item.insert ?? item.label
    // At every cursor whose word before it is the same prefix.
    const changes = state.selection.ranges
      .filter((r) => r.empty && wordBefore(state, r.head).text === context.prefix)
      .map((r) => ({ from: r.head - context.prefix.length, to: r.head, insert }))
    if (changes.length === 0) return
    this.dispatch({ changes, userEvent: 'input.complete' })
  }

  // Tooltips -------------------------------------------------------------------

  /** A position's place in the content's pixels: its left, its line's top and bottom. */
  private localAt(pos: number): { left: number; top: number; bottom: number } {
    const line = this.editorState.doc.lineAt(pos)
    const top = this.lineTop(line.index)
    return { left: PAD + this.xAt(line.index, pos - line.from), top, bottom: top + this.lineHeight }
  }

  private onHoverMove(event: MouseEvent): void {
    if (!this.hoverSource || event.buttons !== 0) return
    // Over a tooltip itself: it stays.
    if ((event.target as Element).closest?.('.dsk-code-editor__tooltip')) return
    const pos = this.posAtCoords(event.clientX, event.clientY)
    const line = this.editorState.doc.lineAt(pos)
    // Past a line's end there is nothing to tell.
    const end =
      this.content.getBoundingClientRect().left + PAD + this.xAt(line.index, line.text.length)
    this.hoverLater(event.clientX > end ? null : pos)
  }

  /** The pointer rests at a position (null: off the text): the tooltip for it after a moment. */
  private hoverLater(pos: number | null): void {
    clearTimeout(this.hoverTimer)
    if (pos === null) {
      this.hoverAt = -1
      this.hoverTimer = setTimeout(() => this.hoverTip.close(), 300) as unknown as number
      return
    }
    const [from, to] = wordAroundRange(this.editorState, pos)
    // Over the same word: what is shown stays.
    if (this.hoverTip.open && this.hoverAt >= from && this.hoverAt <= to) return
    this.hoverTimer = setTimeout(() => void this.hover(pos), 450) as unknown as number
  }

  private async hover(pos: number): Promise<void> {
    const request = ++this.popupRequest
    const content = await this.hoverSource?.({ state: this.editorState, pos })
    if (request !== this.popupRequest) return
    if (!content) return this.hoverTip.close()
    this.hoverAt = pos
    const [from] = wordAroundRange(this.editorState, pos)
    this.hoverTip.show(content, this.localAt(from), true)
  }

  private async signature(explicit: boolean): Promise<void> {
    const pos = this.editorState.selection.main.head
    const request = ++this.popupRequest
    const content = await this.signatureSource?.({ state: this.editorState, pos, explicit })
    if (request !== this.popupRequest || this.editorState.selection.main.head !== pos) return
    if (!content) return this.signatureTip.close()
    this.signatureTip.show(content, this.localAt(pos), true)
  }

  // Search ---------------------------------------------------------------------

  private find(backwards: boolean): boolean {
    const state = this.editorState
    const main = state.selection.main
    if (!this.pattern) {
      const text = main.empty
        ? state.doc.slice(...wordAroundRange(state, main.head))
        : state.doc.slice(main.from, main.to)
      if (!text.trim() || text.includes('\n')) return false
      this.setSearch({ search: text, caseSensitive: true })
    }
    const pattern = this.pattern
    if (!pattern) return false
    const match = findFrom(state.doc, pattern, backwards ? main.from : main.to, backwards)
    if (!match) return false
    this.dispatch({
      selection: Selection.single(match.from, match.to),
      userEvent: 'select.search',
      scrollIntoView: true,
    })
    return true
  }

  // Brackets -------------------------------------------------------------------

  /** The bracket at (or just before) the main cursor and its pair, as offsets; null when there is none. */
  private bracketPair(): [number, number] | null {
    const state = this.editorState
    const main = state.selection.main
    if (!main.empty) return null
    const doc = state.doc
    const head = main.head
    const OPEN = '([{'
    const CLOSE = ')]}'
    for (const pos of [head, head - 1]) {
      if (pos < 0 || pos >= doc.length) continue
      const ch = doc.slice(pos, pos + 1)
      const o = OPEN.indexOf(ch)
      const c = CLOSE.indexOf(ch)
      if (o < 0 && c < 0) continue
      if (!this.structural(pos)) continue
      const forward = o >= 0
      const mine = forward ? OPEN[o]! : CLOSE[c]!
      const other = forward ? CLOSE[o]! : OPEN[c]!
      const line = doc.lineAt(pos).index
      const limit = 2000
      let depth = 0
      for (
        let i = line;
        forward ? i < Math.min(doc.lineCount, line + limit) : i >= Math.max(0, line - limit);
        i += forward ? 1 : -1
      ) {
        const text = doc.lineText(i)
        const start = doc.lineStart(i)
        let k = i === line ? pos - start : forward ? 0 : text.length - 1
        for (; forward ? k < text.length : k >= 0; k += forward ? 1 : -1) {
          const x = text[k]
          if (x !== mine && x !== other) continue
          if (!this.structural(start + k)) continue
          if (x === mine) depth++
          else if (--depth === 0) return forward ? [pos, start + k] : [start + k, pos]
        }
      }
      return null
    }
    return null
  }

  /** Whether a bracket is code (not in a string or a comment), by the highlighting's tokens. */
  private structural(pos: number): boolean {
    if (!this.highlighting.active) return true
    const doc = this.editorState.doc
    const line = doc.lineAt(pos)
    const row = this.highlighting.tokens(line.index, line.index + 1)?.[0]
    if (!row) return true
    let at = 0
    for (const t of row) {
      if (pos - line.from < at + t.text.length)
        return t.type !== 'string' && t.type !== 'comment' && t.type !== 'regex'
      at += t.text.length
    }
    return true
  }

  /** The cursor's line in the middle of the view (a jump far away). */
  private centerCursor(): void {
    const { doc, selection } = this.editorState
    const row = this.folding.rowOf(doc.lineAt(selection.main.head).index)
    const top = row * this.lineHeight - this.dom.clientHeight / 2
    this.dom.scrollTop = Math.max(0, top / this.scale())
    this.draw()
  }

  // Measuring ----------------------------------------------------------------

  private measure(): void {
    const width = this.ruler.firstElementChild!.getBoundingClientRect().width / 100
    const height = this.ruler.getBoundingClientRect().height
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
    const annotation = this.gutterExtras.hasAnnotations
      ? Math.ceil((this.gutterExtras.annotationChars + 2) * this.charWidth)
      : 0
    this.gutterWidth = this.showNumbers
      ? Math.ceil(String(count).length * this.charWidth + 20 + FOLD_WIDTH) + annotation
      : 0
    this.gutterLines.style.paddingLeft = `${8 + annotation}px`
    this.gutterLines.style.setProperty('--dsk-code-editor-annotation-width', `${annotation}px`)
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
          const gm = this.gutterExtras.markAt(i)
          if (gm) {
            const bar = d.createElement('span')
            bar.className = `dsk-code-editor__mark dsk-code-editor__mark--${gm.kind}`
            bar.dataset.line = String(i)
            if (gm.title) bar.title = gm.title
            n.append(bar)
          }
          const note = this.gutterExtras.annotationAt(i)
          if (note) {
            const a = d.createElement('span')
            a.className = 'dsk-code-editor__annotation'
            a.dataset.line = String(i)
            a.textContent = note.text
            if (note.title) a.title = note.title
            n.append(a)
          }
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
    // The search's matches in view, and the bracket pair at the cursor: behind the text.
    if (this.pattern && last > first) {
      const main = selection.main
      for (const m of matchesIn(doc, this.pattern, first, last, 2000)) {
        const line = doc.lineAt(m.from)
        if (this.folding.isHidden(line.index)) continue
        const x1 = this.xAt(line.index, m.from - line.from)
        const x2 = this.xAt(line.index, m.to - line.from)
        const current = m.from === main.from && m.to === main.to
        selections.append(
          rect(
            `dsk-code-editor__match${current ? ' dsk-code-editor__match--current' : ''}`,
            PAD + x1,
            this.lineTop(line.index),
            Math.max(2, x2 - x1),
          ),
        )
      }
    }
    const pair = this.bracketPair()
    if (pair)
      for (const pos of pair) {
        const line = doc.lineAt(pos)
        if (line.index < first || line.index >= last || this.folding.isHidden(line.index)) continue
        const x1 = this.xAt(line.index, pos - line.from)
        const x2 = this.xAt(line.index, pos - line.from + 1)
        selections.append(
          rect(
            'dsk-code-editor__bracket',
            PAD + x1,
            this.lineTop(line.index),
            Math.max(2, x2 - x1),
          ),
        )
      }
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
      // Drawn again only when something changed (a redraw replaces the line elements).
      let changed = this.folding.setAvailable(
        text ? foldRanges(text, lang!).map((r) => ({ start: r.start - 1, end: r.end - 1 })) : [],
      )
      if (this.validating) {
        const found = text && canValidate(lang!) ? fromValidation(doc, validate(text, lang!)) : []
        if (this.diagnosticsModel.set('syntax', found, doc.length)) {
          changed = true
          this.toldDiagnostics()
        }
      }
      if (changed) {
        this.marks++
        this.schedule()
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
    // A mark or an annotation: the page is told, with the box to show something by it.
    const extra = (event.target as Element).closest?.(
      '.dsk-code-editor__mark, .dsk-code-editor__annotation',
    ) as HTMLElement | null
    if (extra && event.button === 0) {
      event.preventDefault()
      const line = Number(extra.dataset.line)
      const isMark = extra.classList.contains('dsk-code-editor__mark')
      this.dom.dispatchEvent(
        new CustomEvent(isMark ? 'dsk:gutter-mark' : 'dsk:annotation', {
          bubbles: true,
          detail: {
            ...(isMark ? this.gutterExtras.markAt(line) : this.gutterExtras.annotationAt(line)),
            rect: extra.parentElement!.getBoundingClientRect(),
          },
        }),
      )
      return
    }
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
    // In a tooltip or a field over the text: theirs (text to select, a name to type).
    if ((event.target as Element).closest?.('.dsk-code-editor__tooltip, .dsk-code-editor__prompt')) return
    event.preventDefault()
    this.input.focus()
    const pos = this.posAtCoords(event.clientX, event.clientY)
    // Cmd (macOS) or Ctrl with a click: the page's (going to a definition).
    if ((isMac() ? event.metaKey : event.ctrlKey) && this.onModClick?.(pos)) {
      this.dispatch({
        selection: Selection.single(pos),
        userEvent: 'select.pointer',
        scrollIntoView: false,
      })
      return
    }
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
