import { describe, expect, it } from 'vitest'
import { Folding } from '../../src/view/folding'
import { Layout, wrapBreaks } from '../../src/view/wrap'

describe('where a line wraps', () => {
  it('after the last space that fits; a word longer than a row where the row is full', () => {
    expect(wrapBreaks('short', 10, 4)).toEqual([])
    // "one two three four" at 9 columns: "one two " | "three " | "four"
    expect(wrapBreaks('one two three four', 9, 4)).toEqual([8, 14])
    expect(wrapBreaks('abcdefghijkl', 5, 4)).toEqual([5, 10])
    // Spaces a row ends with stay on it.
    expect(wrapBreaks('aaaa     bbbb', 6, 4)).toEqual([9])
  })

  it('tabs to their stop, wide characters two columns, a surrogate pair never split', () => {
    expect(wrapBreaks('\ta', 5, 4)).toEqual([])
    expect(wrapBreaks('\tabc', 5, 4)).toEqual([1])
    expect(wrapBreaks('漢字漢字', 5, 4)).toEqual([2])
    const emoji = '😀😀😀'
    for (const b of wrapBreaks(emoji, 3, 4)) expect(emoji.charCodeAt(b) >= 0xdc00 && emoji.charCodeAt(b) <= 0xdfff).toBe(false)
  })
})

describe('lines to rows', () => {
  const lines = ['a short line', 'one two three four five six', '', 'x'.repeat(30)]
  const make = () => {
    const folding = new Folding()
    let version = 1
    const layout = new Layout(folding, (i) => lines[i]!, () => lines.length, 10_000, () => version)
    return { folding, layout, bump: () => version++ }
  }

  it('off: one row a line, as folding has them', () => {
    const { layout } = make()
    expect(layout.count).toBe(4)
    expect(layout.rowOf(3)).toBe(3)
    expect(layout.breaksOf(1)).toEqual([])
  })

  it('on: a line as many rows as it breaks into; a row to its line and back', () => {
    const { layout } = make()
    layout.setWrap(10, 4)
    // 'a short line' → 2 rows, 'one two three four five six' → 3, '' → 1, 30 x → 3
    expect([0, 1, 2, 3].map((i) => layout.rowsOf(i))).toEqual([2, 3, 1, 3])
    expect(layout.count).toBe(9)
    expect([0, 1, 2, 3].map((i) => layout.rowOf(i))).toEqual([0, 2, 5, 6])
    expect([0, 1, 2, 3, 4, 5, 6, 8].map((r) => layout.lineOf(r))).toEqual([0, 0, 1, 1, 1, 2, 3, 3])
    expect(layout.segmentOf(1, 0)).toBe(0)
    expect(layout.segmentOf(1, layout.breaksOf(1)[0]!)).toBe(1)
    expect(layout.linesOfRows(3, 7)).toEqual([1, 2, 3])
  })

  it('folded lines take no rows; a change of the text measures again', () => {
    const { folding, layout, bump } = make()
    layout.setWrap(10, 4)
    folding.setAvailable([{ start: 0, end: 2 }])
    folding.fold(0)
    expect(layout.count).toBe(2 + 3)
    expect(layout.lineOf(2)).toBe(3)
    lines[3] = 'x'
    bump()
    expect(layout.count).toBe(2 + 1)
  })
})
