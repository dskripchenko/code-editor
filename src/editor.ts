/**
 * The editor on an element. For now it shows a text's lines with their
 * numbers; the text model, input and drawing only the lines in view come
 * next (docs/internal/adr-001-code-editor.md, E1).
 */
import { ensureStyle } from './style'
import { readText, writeText, type Text } from './text'

export interface CodeEditorOptions {
  /** The text to show. */
  value?: string
  /** The language, by its id in @dskripchenko/syntax (`typescript`, `php`…). */
  language?: string
  /** Line numbers beside the text (on by default). */
  lineNumbers?: boolean
}

export class CodeEditor {
  /** The editor's own element, inside the one it was given. */
  readonly dom: HTMLElement
  private readonly gutter: HTMLElement
  private readonly content: HTMLElement
  private text: Text
  private lang: string | null

  constructor(parent: HTMLElement, options: CodeEditorOptions = {}) {
    const doc = parent.ownerDocument
    this.dom = doc.createElement('div')
    this.dom.className = 'dsk-code-editor'
    this.gutter = doc.createElement('div')
    this.gutter.className = 'dsk-code-editor__gutter'
    this.gutter.setAttribute('aria-hidden', 'true')
    this.gutter.hidden = options.lineNumbers === false
    this.content = doc.createElement('div')
    this.content.className = 'dsk-code-editor__content'
    this.content.setAttribute('role', 'textbox')
    this.content.setAttribute('aria-multiline', 'true')
    this.content.setAttribute('aria-readonly', 'true')
    this.dom.append(this.gutter, this.content)
    parent.append(this.dom)
    ensureStyle(this.dom)

    this.text = readText(options.value ?? '')
    this.lang = options.language ?? null
    this.draw()
  }

  /** The text, with the line breaks it was given with. */
  get value(): string {
    return writeText(this.text)
  }

  set value(value: string) {
    this.text = readText(value)
    this.draw()
  }

  get language(): string | null {
    return this.lang
  }

  set language(language: string | null) {
    this.lang = language
    if (language) this.dom.dataset.language = language
    else delete this.dom.dataset.language
  }

  /** How many lines the text has. */
  get lineCount(): number {
    return this.text.lines.length
  }

  /** Takes the editor off the page. */
  destroy(): void {
    this.dom.remove()
  }

  private draw(): void {
    const doc = this.dom.ownerDocument
    const numbers = doc.createDocumentFragment()
    const lines = doc.createDocumentFragment()
    this.text.lines.forEach((text, i) => {
      const n = doc.createElement('div')
      n.className = 'dsk-code-editor__line'
      n.textContent = String(i + 1)
      numbers.append(n)
      const line = doc.createElement('div')
      line.className = 'dsk-code-editor__line'
      line.textContent = text
      lines.append(line)
    })
    this.gutter.replaceChildren(numbers)
    this.content.replaceChildren(lines)
    this.language = this.lang
  }
}
