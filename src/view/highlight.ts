/**
 * Highlighting while the text is edited: the tokenizer's state is kept per
 * line by @dskripchenko/syntax, an edit tokenizes again only as far as it
 * changes anything, and the rest of a long file is settled in idle time.
 */
import { IncrementalHighlighter, resolveLanguage, type Token } from '@dskripchenko/syntax'
import type { Doc } from '../state/doc'
import type { LineChange } from '../state/state'

type IdleWindow = Window & {
  requestIdleCallback?: (fn: (deadline: { timeRemaining(): number }) => void) => number
  cancelIdleCallback?: (handle: number) => void
}

/** Lines tokenized per idle step, between looks at the time left. */
const STEP = 2000

export class Highlighting {
  private highlighter: IncrementalHighlighter | null = null
  private handle = 0
  private idle = false

  constructor(
    private readonly doc: () => Doc,
    private readonly win: IdleWindow,
    /** Called when lines settle in idle time (the lines in view may need drawing again). */
    private readonly settledMore: () => void,
  ) {}

  /** The language's id, or null when it is not known (the text stays plain). */
  setLanguage(language: string | null): string | null {
    const id = language ? resolveLanguage(language) : null
    this.cancel()
    if (!id) {
      this.highlighter = null
      return null
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    this.highlighter = new IncrementalHighlighter(
      {
        get lineCount() {
          return self.doc().lineCount
        },
        lineText: (i) => self.doc().lineText(i),
      },
      id,
    )
    this.schedule()
    return id
  }

  /** The whole text replaced. */
  reset(): void {
    if (!this.highlighter) return
    this.highlighter.reset()
    this.schedule()
  }

  edit(change: LineChange): void {
    if (!this.highlighter) return
    this.highlighter.edit(change.from, change.oldEnd, change.newEnd)
    this.schedule()
  }

  get active(): boolean {
    return this.highlighter !== null
  }

  /** Tokens of the lines, or null with no language. */
  tokens(from: number, to: number): Token[][] | null {
    return this.highlighter?.tokens(from, to) ?? null
  }

  /** Whether the tokens of lines before `to` are final rather than a guess. */
  settled(to: number): boolean {
    return this.highlighter?.settled(to) ?? true
  }

  destroy(): void {
    this.cancel()
    this.highlighter = null
  }

  private schedule(): void {
    if (this.handle || !this.highlighter || this.highlighter.done) return
    const run = (deadline?: { timeRemaining(): number }): void => {
      this.handle = 0
      const h = this.highlighter
      if (!h) return
      const start = performance.now()
      const left = (): number =>
        deadline ? deadline.timeRemaining() : 8 - (performance.now() - start)
      let done = h.done
      while (!done && left() > 2) done = h.work(STEP)
      this.settledMore()
      if (!done) this.schedule()
    }
    if (this.win.requestIdleCallback) {
      this.idle = true
      this.handle = this.win.requestIdleCallback(run)
    } else {
      this.idle = false
      this.handle = this.win.setTimeout(() => run(), 30)
    }
  }

  private cancel(): void {
    if (!this.handle) return
    if (this.idle) this.win.cancelIdleCallback?.(this.handle)
    else this.win.clearTimeout(this.handle)
    this.handle = 0
  }
}

/** A line's text in spans of its tokens' types (plain text bare); with `from`/`to`, only those columns. */
export function fillLine(
  el: HTMLElement,
  text: string,
  tokens: readonly Token[] | null,
  from = 0,
  to = text.length,
): void {
  if (!tokens) {
    el.textContent = from === 0 && to >= text.length ? text : text.slice(from, to)
    return
  }
  const d = el.ownerDocument
  let pos = 0
  for (const t of tokens) {
    const end = pos + t.text.length
    if (end > from && pos < to) {
      const part =
        pos >= from && end <= to ? t.text : t.text.slice(Math.max(0, from - pos), to - pos)
      if (t.type === 'plain') el.append(part)
      else {
        const span = d.createElement('span')
        span.className = `sx-${t.type}`
        span.textContent = part
        el.append(span)
      }
    }
    pos = end
    if (pos >= to) break
  }
}
