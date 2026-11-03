/**
 * `<dsk-code-editor>`: the editor as an element. The text is the `value`
 * property or, in markup, a `<script type="text/plain">` inside the element
 * (so that nothing in the text is read as HTML); the language is the
 * `language` attribute.
 */
import { CodeEditor } from './editor'

export const CODE_EDITOR_TAG = 'dsk-code-editor'

/** The element's class; defined lazily, so the package loads where there is no DOM. */
export type DskCodeEditorElement = HTMLElement & {
  value: string
  language: string | null
  readonly editor: CodeEditor | null
}

/**
 * Registers `<dsk-code-editor>` (or another name). Defining it twice is
 * harmless: the first definition stays.
 */
export function defineCodeEditor(
  tag = CODE_EDITOR_TAG,
  registry: CustomElementRegistry = customElements,
): void {
  if (registry.get(tag)) return

  class DskCodeEditor extends HTMLElement {
    static observedAttributes = ['language']
    editor: CodeEditor | null = null
    private pending: string | null = null

    get value(): string {
      return this.editor ? this.editor.value : (this.pending ?? this.sourceText())
    }

    set value(value: string) {
      if (this.editor) this.editor.value = value
      else this.pending = value
    }

    get language(): string | null {
      return this.getAttribute('language')
    }

    set language(language: string | null) {
      if (language) this.setAttribute('language', language)
      else this.removeAttribute('language')
    }

    connectedCallback(): void {
      if (this.editor) return
      const value = this.pending ?? this.sourceText()
      this.pending = null
      this.editor = new CodeEditor(this, { value, language: this.language ?? undefined })
    }

    disconnectedCallback(): void {
      if (!this.isConnected && this.editor) {
        this.pending = this.editor.value
        this.editor.destroy()
        this.editor = null
      }
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
      if (name === 'language' && this.editor) this.editor.language = value
    }

    private sourceText(): string {
      const source = this.querySelector(':scope > script[type="text/plain"]')
      return source?.textContent ?? ''
    }
  }

  registry.define(tag, DskCodeEditor)
}
