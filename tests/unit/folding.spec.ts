import { Folding } from '../../src/view/folding'

function random(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
}

describe('Folding', () => {
  it('rows and lines, against counting the hidden lines one by one', () => {
    const next = random(3)
    for (let run = 0; run < 200; run++) {
      const count = 5 + Math.floor(next() * 60)
      const ranges = Array.from({ length: Math.floor(next() * 8) }, () => {
        const start = Math.floor(next() * count)
        return { start, end: Math.min(count - 1, start + 1 + Math.floor(next() * 10)) }
      })
      const f = new Folding()
      f.setAvailable(ranges)
      for (const r of ranges) if (next() < 0.6) f.fold(r.start)
      const hidden = new Set<number>()
      for (const r of f.folds) for (let i = r.start + 1; i <= r.end; i++) hidden.add(i)
      const visible = Array.from({ length: count }, (_, i) => i).filter((i) => !hidden.has(i))
      expect(f.rowCount(count)).toBe(visible.length)
      visible.forEach((line, row) => {
        expect(f.rowOf(line)).toBe(row)
        expect(f.lineOf(row)).toBe(line)
        expect(f.isHidden(line)).toBe(false)
      })
      for (const h of hidden) {
        expect(f.isHidden(h)).toBe(true)
        // A hidden line is on its fold's first line's row.
        let start = h
        while (hidden.has(start)) start--
        expect(f.rowOf(h)).toBe(f.rowOf(start))
      }
      const a = Math.floor(next() * visible.length)
      const b = a + Math.floor(next() * 10)
      expect(f.linesOfRows(a, b, count)).toEqual(visible.slice(a, b))
    }
  })

  it('folds the range on a line or the innermost around it; opens it again', () => {
    const f = new Folding()
    f.setAvailable([
      { start: 0, end: 9 },
      { start: 2, end: 5 },
    ])
    expect(f.fold(3)).toBe(true)
    expect(f.folds).toEqual([{ start: 2, end: 5 }])
    expect(f.fold(7)).toBe(true)
    expect(f.folds).toEqual([
      { start: 0, end: 9 },
      { start: 2, end: 5 },
    ])
    expect(f.rowCount(12)).toBe(3)
    expect(f.unfold(0)).toBe(true)
    expect(f.rowCount(12)).toBe(9)
    expect(f.reveal([4])).toBe(true)
    expect(f.folds).toEqual([])
  })

  it('moves with edits; an edit inside a fold opens it, one on its first line does not', () => {
    const f = new Folding()
    f.setAvailable([
      { start: 2, end: 5 },
      { start: 10, end: 12 },
    ])
    f.fold(2)
    f.fold(10)
    f.map({ from: 0, oldEnd: 1, newEnd: 3 })
    expect(f.folds).toEqual([
      { start: 4, end: 7 },
      { start: 12, end: 14 },
    ])
    f.map({ from: 4, oldEnd: 5, newEnd: 5 })
    expect(f.folds.length).toBe(2)
    f.map({ from: 13, oldEnd: 14, newEnd: 14 })
    expect(f.folds).toEqual([{ start: 4, end: 7 }])
  })
})
