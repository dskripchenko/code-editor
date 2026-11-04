/**
 * Soft wrapping: where a long line breaks into rows at a width (by words,
 * else anywhere), and the layout of the text's lines into the rows on screen
 * that folding and wrapping leave together.
 */
import type { Folding } from './folding'

/** Characters a monospace font draws two columns wide (CJK, fullwidth forms, most emoji). */
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\ud83c-\ud83e][\udc00-\udfff]/

/** The columns a character takes at a column (a tab: to the next stop). */
function widthAt(text: string, i: number, col: number, tabSize: number): number {
  const c = text.charCodeAt(i)
  if (c === 9) return tabSize - (col % tabSize)
  // The second half of a surrogate pair: counted with the first.
  if (c >= 0xdc00 && c <= 0xdfff) return 0
  return WIDE.test(text.slice(i, i + 2)) ? 2 : 1
}

/**
 * Where a line breaks at `cols` columns: the offsets each row after the first
 * starts at (none when it fits). A row ends after the last space that fits;
 * a word longer than a row breaks where the row is full. The spaces a row
 * ends with stay on it (they never start the next one).
 */
export function wrapBreaks(text: string, cols: number, tabSize: number): number[] {
  const out: number[] = []
  if (cols < 2) return out
  let col = 0
  let start = 0
  /** The offset after the last space of the current row (where it may break). */
  let soft = -1
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const w = widthAt(text, i, col, tabSize)
    if (code === 32 || code === 9) {
      col += w
      soft = i + 1
      continue
    }
    if (col + w > cols && i > start) {
      // Back to after the last space, or here when the row has none (a long word).
      const at = soft > start ? soft : i
      out.push(at)
      start = at
      soft = -1
      col = 0
      for (let j = at; j <= i; j++) col += widthAt(text, j, col, tabSize)
      continue
    }
    col += w
  }
  return out
}

/** What the commands and the drawing need of rows. */
export interface Rows {
  /** All the rows. */
  count: number
  /** The first row of a line. */
  rowOf(line: number): number
  /** The line a row belongs to. */
  lineOf(row: number): number
}

/**
 * Lines to rows: folding hides lines; wrapping, when on, gives a line as many
 * rows as it breaks into. Off, it is folding's mapping as it was.
 */
export class Layout implements Rows {
  /** Columns a row holds; null: no wrapping. */
  private cols: number | null = null
  private tabSize = 4
  /** Per line: where its rows after the first start (wrapping on). */
  private breaks: number[][] = []
  /** Per line: its first row; one more for the total. */
  private starts = new Uint32Array(1)
  private dirty = true
  private built = ''

  constructor(
    private readonly folding: Folding,
    private readonly lineText: (index: number) => string,
    private readonly lineCount: () => number,
    /** Lines longer than this are not wrapped (drawn in part, scrolled sideways). */
    private readonly longLine: number,
    /** Changes when the text does: the rows are measured again. */
    private readonly textVersion: () => number,
  ) {}

  get wrapping(): boolean {
    return this.cols !== null
  }

  /** Wrapping at a number of columns, or off (null); true when that changed. */
  setWrap(cols: number | null, tabSize: number): boolean {
    if (cols === this.cols && tabSize === this.tabSize) return false
    this.cols = cols
    this.tabSize = tabSize
    this.dirty = true
    return true
  }

  private build(stamp: string): void {
    this.dirty = false
    this.built = stamp
    if (this.cols === null) return
    const n = this.lineCount()
    this.breaks = new Array<number[]>(n)
    this.starts = new Uint32Array(n + 1)
    let row = 0
    for (let i = 0; i < n; i++) {
      this.starts[i] = row
      if (this.folding.isHidden(i)) {
        this.breaks[i] = []
        continue
      }
      const text = this.lineText(i)
      const b = text.length > this.longLine ? [] : wrapBreaks(text, this.cols, this.tabSize)
      this.breaks[i] = b
      row += b.length + 1
    }
    this.starts[n] = row
  }

  private ready(): void {
    const stamp = `${this.textVersion()}:${this.folding.version}`
    if (this.dirty || stamp !== this.built) this.build(stamp)
  }

  get count(): number {
    if (this.cols === null) return this.folding.rowCount(this.lineCount())
    this.ready()
    return this.starts[this.lineCount()] ?? 0
  }

  rowOf(line: number): number {
    if (this.cols === null) return this.folding.rowOf(line)
    this.ready()
    // A hidden line: the row of the line its fold starts on.
    if (this.folding.isHidden(line)) {
      let at = line
      while (at > 0 && this.folding.isHidden(at)) at--
      return this.starts[at] ?? 0
    }
    return this.starts[Math.min(line, this.lineCount())] ?? 0
  }

  lineOf(row: number): number {
    if (this.cols === null) return this.folding.lineOf(row)
    this.ready()
    const n = this.lineCount()
    // The last visible line whose first row is at or before the row.
    let lo = 0
    let hi = n - 1
    let k = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.starts[mid]! <= row) {
        k = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    while (k > 0 && this.folding.isHidden(k)) k--
    return k
  }

  /** The offsets where a line's rows after the first start. */
  breaksOf(line: number): readonly number[] {
    if (this.cols === null) return []
    this.ready()
    return this.breaks[line] ?? []
  }

  /** How many rows a line takes. */
  rowsOf(line: number): number {
    return this.breaksOf(line).length + 1
  }

  /** Which of its rows a position of a line is on (a break belongs to the row it starts). */
  segmentOf(line: number, ch: number): number {
    const b = this.breaksOf(line)
    let k = 0
    while (k < b.length && b[k]! <= ch) k++
    return k
  }

  /** The visible lines with a row from `fromRow` to `toRow` (excluded). */
  linesOfRows(fromRow: number, toRow: number): number[] {
    const n = this.lineCount()
    if (this.cols === null) return this.folding.linesOfRows(fromRow, toRow, n)
    const out: number[] = []
    for (let line = this.lineOf(fromRow); line < n && this.rowOf(line) < toRow; line++) {
      if (this.folding.isHidden(line)) continue
      out.push(line)
    }
    return out
  }
}
