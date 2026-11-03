/**
 * "Go to line": a small field over the editor's top edge — a line, or
 * `line:column`; Enter goes there, Escape (or leaving it) closes it.
 */

export class GoToLine {
  private readonly dom: HTMLElement
  private readonly field: HTMLInputElement

  constructor(
    parent: HTMLElement,
    private readonly go: (line: number, column: number) => void,
    private readonly closed: () => void,
  ) {
    const d = parent.ownerDocument
    this.dom = d.createElement('div')
    this.dom.className = 'dsk-code-editor__panel'
    this.dom.hidden = true
    this.field = d.createElement('input')
    this.field.className = 'dsk-code-editor__panel-input'
    this.field.type = 'text'
    this.field.inputMode = 'numeric'
    this.field.setAttribute('aria-label', 'Go to line')
    this.dom.append(this.field)
    this.field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const m = /^\s*(\d+)\s*(?:[:,]\s*(\d+))?\s*$/.exec(this.field.value)
        this.close()
        if (m) this.go(Number(m[1]), Number(m[2] ?? 1))
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
      }
      e.stopPropagation()
    })
    this.field.addEventListener('blur', () => this.close(false))
    // First in the scroller, sticky at its top: it stays over the text as it scrolls.
    parent.prepend(this.dom)
  }

  get open(): boolean {
    return !this.dom.hidden
  }

  show(placeholder: string): void {
    this.field.placeholder = placeholder
    this.field.value = ''
    this.dom.hidden = false
    this.field.focus()
  }

  close(refocus = true): void {
    if (this.dom.hidden) return
    this.dom.hidden = true
    if (refocus) this.closed()
  }
}
