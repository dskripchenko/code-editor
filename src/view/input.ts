/**
 * Where typed text comes from. EditContext (Chromium) hands the editor text,
 * IME composition and the place for the IME's window without a
 * contenteditable; elsewhere a hidden textarea at the cursor takes keys and
 * composition, and shows the text being composed over the cursor.
 */
import { insertText, selectedText } from '../commands'
import { Selection } from '../state/selection'
import type { EditorState, TransactionSpec } from '../state/state'
import {
  createEditContext,
  type CharacterBoundsUpdateEventLike,
  type EditContextLike,
  type TextFormatUpdateEventLike,
  type TextUpdateEventLike,
} from './edit-context'

/** What an input needs from the editor. */
export interface InputHost {
  readonly state: EditorState
  readonly readOnly: boolean
  /** The element text is typed into (EditContext) or the textarea goes in. */
  readonly content: HTMLElement
  dispatch(spec: TransactionSpec, fromInput?: boolean): void
  handleKey(event: KeyboardEvent): boolean
  copy(event: ClipboardEvent): void
  cut(event: ClipboardEvent): void
  paste(event: ClipboardEvent): void
  focusChanged(focused: boolean): void
  breakHistory(): void
  /** Underlines of the text being composed, as ranges of the text. */
  setComposition(ranges: readonly { from: number; to: number }[]): void
  /** A character's box on the screen. */
  charRect(pos: number): DOMRect
}

export interface Input {
  readonly kind: 'editcontext' | 'textarea'
  readonly composing: boolean
  /** The input catches up with the editor's text and selection. */
  sync(): void
  /** The cursor's box: the IME's window goes there. */
  place(cursor: DOMRect, control: DOMRect, local: { left: number; top: number }): void
  focus(): void
  hasFocus(): boolean
  destroy(): void
}

/** Text around the cursor EditContext holds: a window, not the whole file. */
const WINDOW_LINES = 20
const WINDOW_CHARS = 5000

function listen(target: EventTarget, events: Record<string, (e: never) => void>): () => void {
  for (const [name, fn] of Object.entries(events))
    target.addEventListener(name, fn as EventListener)
  return () => {
    for (const [name, fn] of Object.entries(events))
      target.removeEventListener(name, fn as EventListener)
  }
}

class EditContextInput implements Input {
  readonly kind = 'editcontext'
  composing = false
  private from = 0
  private to = 0
  private readonly off: (() => void)[] = []

  constructor(
    private readonly host: InputHost,
    private readonly ec: EditContextLike,
  ) {
    const el = host.content
    el.tabIndex = 0
    ;(el as HTMLElement & { editContext: EditContextLike | null }).editContext = ec
    this.off.push(
      listen(ec, {
        textupdate: (e: TextUpdateEventLike) => this.onText(e),
        textformatupdate: (e: TextFormatUpdateEventLike) => this.onFormat(e),
        characterboundsupdate: (e: CharacterBoundsUpdateEventLike) => this.onBounds(e),
        compositionstart: () => {
          this.composing = true
        },
        compositionend: () => {
          this.composing = false
          host.setComposition([])
          host.breakHistory()
          this.sync()
        },
      }),
      listen(el, {
        keydown: (e: KeyboardEvent) => {
          if (this.composing || e.isComposing || e.keyCode === 229) return
          host.handleKey(e)
        },
        focus: () => host.focusChanged(true),
        blur: () => host.focusChanged(false),
        copy: (e: ClipboardEvent) => host.copy(e),
        cut: (e: ClipboardEvent) => host.cut(e),
        paste: (e: ClipboardEvent) => host.paste(e),
      }),
    )
    this.sync()
  }

  sync(): void {
    if (this.composing) return
    const { doc, selection } = this.host.state
    const { head, anchor } = selection.main
    const line = doc.lineAt(head)
    this.from = Math.max(doc.lineStart(Math.max(0, line.index - WINDOW_LINES)), head - WINDOW_CHARS)
    this.to = Math.min(
      doc.lineEnd(Math.min(doc.lineCount - 1, line.index + WINDOW_LINES)),
      head + WINDOW_CHARS,
    )
    this.ec.updateText(0, this.ec.text.length, doc.slice(this.from, this.to))
    this.ec.updateSelection(this.local(Math.min(anchor, head)), this.local(Math.max(anchor, head)))
  }

  place(cursor: DOMRect, control: DOMRect): void {
    this.ec.updateSelectionBounds(cursor)
    this.ec.updateControlBounds(control)
  }

  focus(): void {
    this.host.content.focus({ preventScroll: true })
  }

  hasFocus(): boolean {
    return this.host.content.matches(':focus')
  }

  destroy(): void {
    for (const off of this.off) off()
    ;(this.host.content as HTMLElement & { editContext: EditContextLike | null }).editContext = null
  }

  private local(pos: number): number {
    return Math.max(0, Math.min(pos, this.to) - this.from)
  }

  private onText(e: TextUpdateEventLike): void {
    const host = this.host
    if (host.readOnly) return this.sync()
    const from = this.from + e.updateRangeStart
    const to = this.from + e.updateRangeEnd
    const main = host.state.selection.main
    // Plain typing over what the context saw as the selection: the text goes to every cursor, and over all of a selection bigger than the window.
    if (
      !this.composing &&
      from === this.from + this.local(main.from) &&
      to === this.from + this.local(main.to)
    ) {
      const spec = insertText(e.text)(host.state, { pageLines: 0 })
      if (spec) host.dispatch(spec)
      return
    }
    // A composition, or a change the system made (autocorrect, an accent over the last letter): taken as it is.
    this.to += e.text.length - (to - from)
    host.dispatch(
      {
        changes: { from, to, insert: e.text },
        selection: Selection.single(this.from + e.selectionStart, this.from + e.selectionEnd),
        userEvent: this.composing ? 'input.compose' : 'input.type',
      },
      true,
    )
  }

  private onFormat(e: TextFormatUpdateEventLike): void {
    this.host.setComposition(
      e
        .getTextFormats()
        .map((f) => ({ from: this.from + f.rangeStart, to: this.from + f.rangeEnd })),
    )
  }

  private onBounds(e: CharacterBoundsUpdateEventLike): void {
    const rects: DOMRect[] = []
    for (let i = e.rangeStart; i < e.rangeEnd; i++) rects.push(this.host.charRect(this.from + i))
    this.ec.updateCharacterBounds(e.rangeStart, rects)
  }
}

/** Selected text put into the textarea, so the system has something to copy and to type over. */
const PREPARED_LIMIT = 1000

class TextareaInput implements Input {
  readonly kind = 'textarea'
  composing = false
  private readonly area: HTMLTextAreaElement
  private prepared = ''
  private readonly off: () => void

  constructor(private readonly host: InputHost) {
    const area = host.content.ownerDocument.createElement('textarea')
    area.className = 'dsk-code-editor__input'
    area.setAttribute('autocapitalize', 'off')
    area.setAttribute('autocomplete', 'off')
    area.setAttribute('autocorrect', 'off')
    area.setAttribute('aria-multiline', 'true')
    area.spellcheck = false
    area.wrap = 'off'
    host.content.append(area)
    this.area = area
    this.off = listen(area, {
      input: (e: InputEvent) => this.onInput(e),
      compositionstart: () => {
        this.composing = true
        area.classList.add('dsk-code-editor__input--composing')
      },
      compositionupdate: (e: CompositionEvent) => {
        area.style.width = `${Math.max(1, [...(e.data ?? '')].length + 1)}ch`
      },
      compositionend: (e: CompositionEvent) => {
        this.composing = false
        area.classList.remove('dsk-code-editor__input--composing')
        area.style.width = ''
        const text = e.data || area.value
        if (text && !host.readOnly) {
          const spec = insertText(text, 'input.compose')(host.state, { pageLines: 0 })
          if (spec) host.dispatch(spec)
        }
        host.breakHistory()
        this.sync()
      },
      keydown: (e: KeyboardEvent) => {
        if (this.composing || e.isComposing || e.keyCode === 229) return
        host.handleKey(e)
      },
      focus: () => host.focusChanged(true),
      blur: () => host.focusChanged(false),
      copy: (e: ClipboardEvent) => host.copy(e),
      cut: (e: ClipboardEvent) => host.cut(e),
      paste: (e: ClipboardEvent) => host.paste(e),
    })
    this.sync()
  }

  sync(): void {
    if (this.composing) return
    this.prepared = selectedText(this.host.state).slice(0, PREPARED_LIMIT)
    this.area.value = this.prepared
    this.area.setSelectionRange(0, this.prepared.length)
  }

  place(_cursor: DOMRect, _control: DOMRect, local: { left: number; top: number }): void {
    this.area.style.left = `${local.left}px`
    this.area.style.top = `${local.top}px`
  }

  focus(): void {
    this.area.focus({ preventScroll: true })
  }

  hasFocus(): boolean {
    return this.area.matches(':focus')
  }

  destroy(): void {
    this.off()
    this.area.remove()
  }

  private onInput(e: InputEvent): void {
    if (this.composing || e.isComposing) return
    let text = this.area.value
    if (text === this.prepared) return
    // The selection was not replaced (the system lost it): only what came after it is typed.
    if (this.prepared && text.startsWith(this.prepared) && text.length > this.prepared.length)
      text = text.slice(this.prepared.length)
    if (text && !this.host.readOnly) {
      const spec = insertText(text)(this.host.state, { pageLines: 0 })
      if (spec) this.host.dispatch(spec)
    }
    this.sync()
  }
}

export function createInput(
  host: InputHost,
  kind: 'auto' | 'editcontext' | 'textarea' = 'auto',
): Input {
  if (kind !== 'textarea') {
    const ec = createEditContext()
    if (ec) return new EditContextInput(host, ec)
  }
  return new TextareaInput(host)
}
