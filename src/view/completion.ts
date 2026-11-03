/**
 * Completion: a list under the cursor of what may finish the word being
 * typed — the page's suggestions (a language server, a schema) and the words
 * of the text itself — picked with the arrows and Enter or Tab.
 */
import type { EditorState } from '../state/state'

export interface CompletionItem {
  /** Shown in the list, and inserted unless `insert` says otherwise. */
  readonly label: string
  readonly insert?: string
  /** A note after the label (a type, a signature). */
  readonly detail?: string
  /** What it is (`function`, `variable`, `keyword`, `word`…): a class on its row. */
  readonly kind?: string
}

export interface CompletionContext {
  readonly state: EditorState
  /** The cursor. */
  readonly pos: number
  /** The part of the word before the cursor, and where it starts. */
  readonly prefix: string
  readonly from: number
  /** Asked for by a key (Ctrl+Space), not by typing. */
  readonly explicit: boolean
}

export type CompletionSource = (
  context: CompletionContext,
) => readonly CompletionItem[] | null | Promise<readonly CompletionItem[] | null>

const WORD = /[\p{L}\p{N}_$]/u
const WORDS = /[\p{L}_$][\p{L}\p{N}_$]*/gu

/** The word before a position: where it starts and its text. */
export function wordBefore(state: EditorState, pos: number): { from: number; text: string } {
  const line = state.doc.lineAt(pos)
  let i = pos - line.from
  while (i > 0 && WORD.test(line.text[i - 1]!)) i--
  return { from: line.from + i, text: line.text.slice(i, pos - line.from) }
}

/**
 * The words of the text that start with the prefix (case aside), the nearest
 * to the cursor first; the text is read up to a few thousand lines around it.
 */
export function wordsOf(context: CompletionContext, limit = 50): CompletionItem[] {
  const { state, pos, prefix } = context
  const doc = state.doc
  const lower = prefix.toLowerCase()
  const here = doc.lineAt(pos).index
  const seen = new Map<string, number>()
  const span = 3000
  for (let i = Math.max(0, here - span); i < Math.min(doc.lineCount, here + span); i++) {
    const text = doc.lineText(i)
    if (lower && !text.toLowerCase().includes(lower)) continue
    WORDS.lastIndex = 0
    for (let m = WORDS.exec(text); m; m = WORDS.exec(text)) {
      const w = m[0]
      if (w.length < 2 || w === prefix) continue
      if (!w.toLowerCase().startsWith(lower)) continue
      // The word being typed is not its own suggestion.
      if (i === here && doc.lineStart(i) + m.index === context.from) continue
      const distance = Math.abs(i - here)
      if (!seen.has(w) || seen.get(w)! > distance) seen.set(w, distance)
    }
  }
  return [...seen]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label]) => ({ label, kind: 'word' }))
}

/** The list on the screen: shown, moved through, picked from. */
export class CompletionList {
  readonly dom: HTMLElement
  private items: readonly CompletionItem[] = []
  private active = 0
  context: CompletionContext | null = null

  constructor(
    parent: HTMLElement,
    private readonly pick: (item: CompletionItem) => void,
  ) {
    const d = parent.ownerDocument
    this.dom = d.createElement('div')
    this.dom.className = 'dsk-code-editor__completion'
    this.dom.setAttribute('role', 'listbox')
    this.dom.hidden = true
    // A click picks without taking the focus from the text.
    this.dom.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const row = (e.target as Element).closest('[data-index]') as HTMLElement | null
      if (row) this.pick(this.items[Number(row.dataset.index)]!)
    })
    parent.append(this.dom)
  }

  get open(): boolean {
    return !this.dom.hidden
  }

  get selected(): CompletionItem | null {
    return this.items[this.active] ?? null
  }

  show(
    items: readonly CompletionItem[],
    context: CompletionContext,
    at: { left: number; top: number },
  ): void {
    this.items = items
    this.context = context
    this.active = 0
    if (items.length === 0) return this.close()
    const d = this.dom.ownerDocument
    const rows = items.map((item, i) => {
      const row = d.createElement('div')
      row.className = `dsk-code-editor__completion-item${item.kind ? ` dsk-code-editor__completion-item--${item.kind}` : ''}`
      row.setAttribute('role', 'option')
      row.dataset.index = String(i)
      const label = d.createElement('span')
      label.className = 'dsk-code-editor__completion-label'
      label.textContent = item.label
      row.append(label)
      if (item.detail) {
        const detail = d.createElement('span')
        detail.className = 'dsk-code-editor__completion-detail'
        detail.textContent = item.detail
        row.append(detail)
      }
      return row
    })
    this.dom.replaceChildren(...rows)
    this.dom.style.left = `${at.left}px`
    this.dom.style.top = `${at.top}px`
    this.dom.hidden = false
    this.mark()
  }

  move(by: number): void {
    if (!this.items.length) return
    this.active = (this.active + by + this.items.length) % this.items.length
    this.mark()
  }

  close(): void {
    this.dom.hidden = true
    this.context = null
    this.items = []
  }

  private mark(): void {
    const rows = this.dom.children
    for (let i = 0; i < rows.length; i++) {
      const on = i === this.active
      rows[i]!.classList.toggle('dsk-code-editor__completion-item--active', on)
      rows[i]!.setAttribute('aria-selected', String(on))
      if (on) (rows[i] as HTMLElement).scrollIntoView?.({ block: 'nearest' })
    }
  }
}
