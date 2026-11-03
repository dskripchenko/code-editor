import { Gutter } from '../../src/view/gutter'

describe('gutter marks and annotations', () => {
  it('one mark a line, the last source wins; edits move them; replaced lines lose theirs', () => {
    const g = new Gutter()
    g.setMarks('diff', [
      { line: 1, kind: 'added' },
      { line: 5, kind: 'modified' },
    ])
    g.setMarks('bp', [{ line: 5, kind: 'breakpoint' }])
    expect(g.markAt(5)?.kind).toBe('breakpoint')
    g.setAnnotations([{ line: 5, text: 'ann 2d' }])
    expect(g.annotationChars).toBe(6)
    g.map({ from: 0, oldEnd: 1, newEnd: 3 })
    expect(g.markAt(3)?.kind).toBe('added')
    expect(g.markAt(7)?.kind).toBe('breakpoint')
    expect(g.annotationAt(7)?.text).toBe('ann 2d')
    g.map({ from: 7, oldEnd: 8, newEnd: 8 })
    expect(g.markAt(7)).toBeUndefined()
    expect(g.annotationAt(7)).toBeUndefined()
    g.setMarks('diff', [])
    expect(g.markAt(3)).toBeUndefined()
    g.setAnnotations(null)
    expect(g.hasAnnotations).toBe(false)
  })
})
