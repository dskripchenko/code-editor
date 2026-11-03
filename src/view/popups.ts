/**
 * What the editor shows by the text for the page: a tooltip (what a name is,
 * a call's parameters), a menu at the cursor (actions to choose from) and a
 * field over a word (a new name). Each sits in the content, so it scrolls
 * with the text.
 */

export type PopupContent = string | HTMLElement

/** A box of the page's content by a place in the text: above it, or below when there is no room. */
export class Tooltip {
  readonly dom: HTMLElement

  constructor(parent: HTMLElement, className: string) {
    this.dom = parent.ownerDocument.createElement('div')
    this.dom.className = `dsk-code-editor__tooltip ${className}`
    this.dom.hidden = true
    this.dom.setAttribute('role', 'tooltip')
    parent.append(this.dom)
  }

  get open(): boolean {
    return !this.dom.hidden
  }

  /** At a place in the content's pixels (the top and bottom of its line). */
  show(
    content: PopupContent,
    at: { left: number; top: number; bottom: number },
    above = false,
  ): void {
    if (typeof content === 'string') this.dom.textContent = content
    else this.dom.replaceChildren(content)
    this.dom.hidden = false
    this.dom.style.left = `${Math.max(0, at.left)}px`
    const height = this.dom.offsetHeight
    // Above the line when asked and there is room in the content; below it otherwise.
    const up = above && at.top - height - 4 >= 0
    this.dom.style.top = `${up ? at.top - height - 4 : at.bottom + 4}px`
  }

  close(): void {
    this.dom.hidden = true
    this.dom.replaceChildren()
  }
}

export interface MenuItem {
  label: string
  detail?: string
}

/** A list at the cursor, chosen from with the arrows and Enter (or a click); Escape or a click away leaves it. */
export function openMenu(
  parent: HTMLElement,
  items: readonly MenuItem[],
  at: { left: number; top: number },
): Promise<number | null> {
  const d = parent.ownerDocument
  const box = d.createElement('div')
  box.className = 'dsk-code-editor__completion dsk-code-editor__menu'
  box.setAttribute('role', 'menu')
  box.style.left = `${at.left}px`
  box.style.top = `${at.top}px`
  let active = 0
  const rows = items.map((item, i) => {
    const row = d.createElement('div')
    row.className = 'dsk-code-editor__completion-item'
    row.setAttribute('role', 'menuitem')
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
  box.append(...rows)
  parent.append(box)
  const mark = () =>
    rows.forEach((r, i) => {
      r.classList.toggle('dsk-code-editor__completion-item--active', i === active)
      if (i === active) r.scrollIntoView?.({ block: 'nearest' })
    })
  mark()
  return new Promise((resolve) => {
    const done = (value: number | null) => {
      d.removeEventListener('keydown', onKey, true)
      d.removeEventListener('mousedown', onDown, true)
      box.remove()
      resolve(value)
    }
    const onKey = (e: KeyboardEvent) => {
      const keys: Record<string, () => void> = {
        ArrowDown: () => ((active = (active + 1) % rows.length), mark()),
        ArrowUp: () => ((active = (active - 1 + rows.length) % rows.length), mark()),
        Enter: () => done(active),
        Tab: () => done(active),
        Escape: () => done(null),
      }
      const fn = keys[e.key]
      if (!fn) return
      e.preventDefault()
      e.stopPropagation()
      fn()
    }
    const onDown = (e: MouseEvent) => {
      const row = (e.target as Element).closest?.('[data-index]') as HTMLElement | null
      e.preventDefault()
      e.stopPropagation()
      if (row && box.contains(row)) done(Number(row.dataset.index))
      else done(null)
    }
    d.addEventListener('keydown', onKey, true)
    d.addEventListener('mousedown', onDown, true)
  })
}

/** A field over a place in the text, its value chosen with Enter; Escape or leaving it gives null. */
export function openPrompt(
  parent: HTMLElement,
  value: string,
  at: { left: number; top: number; height: number },
): Promise<string | null> {
  const d = parent.ownerDocument
  const field = d.createElement('input')
  field.className = 'dsk-code-editor__prompt'
  field.type = 'text'
  field.value = value
  field.spellcheck = false
  field.style.left = `${at.left}px`
  field.style.top = `${at.top}px`
  field.style.height = `${at.height}px`
  field.style.width = `${Math.max(8, value.length + 4)}ch`
  parent.append(field)
  field.focus()
  field.select()
  return new Promise((resolve) => {
    let settled = false
    const done = (v: string | null) => {
      if (settled) return
      settled = true
      field.remove()
      resolve(v)
    }
    field.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        done(field.value)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        done(null)
      }
    })
    field.addEventListener(
      'input',
      () => (field.style.width = `${Math.max(8, field.value.length + 4)}ch`),
    )
    field.addEventListener('blur', () => done(null))
  })
}

/** A snippet's text (`$1`, `${2:name}`, `$0`) as plain text, and the range to select (the first place; else the end). */
export function expandSnippet(snippet: string): { text: string; select: [number, number] } {
  let text = ''
  const places = new Map<number, [number, number]>()
  for (let i = 0; i < snippet.length; i++) {
    const ch = snippet[i]!
    if (ch === '\\' && i + 1 < snippet.length) {
      text += snippet[++i]
      continue
    }
    if (ch === '$') {
      const simple = /^\$(\d+)/.exec(snippet.slice(i))
      const braced = /^\$\{(\d+)(?::([^}]*))?\}/.exec(snippet.slice(i))
      const m = braced ?? simple
      if (m) {
        const n = Number(m[1])
        const inner = braced ? (braced[2] ?? '') : ''
        if (!places.has(n)) places.set(n, [text.length, text.length + inner.length])
        text += inner
        i += m[0].length - 1
        continue
      }
    }
    text += ch
  }
  const first = [...places.keys()].filter((n) => n > 0).sort((a, b) => a - b)[0]
  const select =
    first !== undefined ? places.get(first)! : (places.get(0) ?? [text.length, text.length])
  return { text, select }
}
