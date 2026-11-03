import { Doc } from '../../src/state/doc'

/** A small random generator, so a failing case can be run again. */
export function random(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

describe('Doc', () => {
  it('reads lines, breaks normalized', () => {
    const doc = new Doc('a\r\nbc\n\nd')
    expect(doc.lineCount).toBe(4)
    expect(doc.length).toBe('a\nbc\n\nd'.length)
    expect(doc.line(1)).toEqual({ index: 1, from: 2, to: 4, text: 'bc' })
    expect(doc.toString('\r\n')).toBe('a\r\nbc\r\n\r\nd')
  })

  it('a final break is an empty last line', () => {
    const doc = new Doc('a\n')
    expect(doc.lineCount).toBe(2)
    expect(doc.lineAt(2)).toEqual({ index: 1, from: 2, to: 2, text: '' })
  })

  it('finds the line of an offset; a line end is on its line', () => {
    const doc = new Doc('ab\ncd\nef')
    expect(doc.lineAt(0).index).toBe(0)
    expect(doc.lineAt(2).index).toBe(0)
    expect(doc.lineAt(3).index).toBe(1)
    expect(doc.lineAt(8).index).toBe(2)
    expect(doc.lineAt(99).index).toBe(2)
  })

  it('slices across lines', () => {
    const doc = new Doc('ab\ncd\nef')
    expect(doc.slice(1, 7)).toBe('b\ncd\ne')
    expect(doc.slice(2, 3)).toBe('\n')
  })

  it('replaces within a line and across lines', () => {
    const doc = new Doc('ab\ncd\nef')
    doc.replace(1, 7, 'X\nY')
    expect(doc.toString()).toBe('aX\nYf')
    expect(doc.lineCount).toBe(2)
    doc.replace(0, 0, '1\n2\n')
    expect(doc.toString()).toBe('1\n2\naX\nYf')
    expect(doc.lineAt(doc.length).from).toBe(7)
  })

  it('keeps line starts right through random edits (against a plain string)', () => {
    const next = random(7)
    let text = 'start\n'
    const doc = new Doc(text)
    const pieces = ['', 'a', '\n', 'xy\n', '\n\n', 'long line of text', 'é', '😀']
    for (let i = 0; i < 2000; i++) {
      const from = Math.floor(next() * (text.length + 1))
      const to = Math.min(text.length, from + Math.floor(next() * 6))
      const insert = pieces[Math.floor(next() * pieces.length)]!
      text = text.slice(0, from) + insert + text.slice(to)
      doc.replace(from, to, insert)
      if (i % 50 === 0) {
        expect(doc.toString()).toBe(text)
        const lines = text.split('\n')
        const probe = Math.floor(next() * (text.length + 1))
        const line = doc.lineAt(probe)
        expect(lines[line.index]).toBe(line.text)
        expect(text.slice(0, line.from).split('\n').length - 1).toBe(line.index)
      }
    }
    expect(doc.toString()).toBe(text)
    expect(doc.length).toBe(text.length)
  })

  it('takes a paste of very many lines', () => {
    const doc = new Doc('a\nb')
    const many = Array.from({ length: 50_000 }, (_, i) => `line ${i}`).join('\n')
    doc.replace(1, 1, many)
    expect(doc.lineCount).toBe(50_001)
    expect(doc.lineText(50_000)).toBe('b')
  })
})
