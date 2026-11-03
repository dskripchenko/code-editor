import { ChangeSet } from '../../src/state/changes'
import { Doc } from '../../src/state/doc'

describe('ChangeSet', () => {
  it('applies several changes at once, offsets of the text before', () => {
    const doc = new Doc('one two three')
    ChangeSet.of([
      { from: 8, to: 13, insert: '3' },
      { from: 0, to: 3, insert: '1' },
    ]).apply(doc)
    expect(doc.toString()).toBe('1 two 3')
  })

  it('joins overlapping changes', () => {
    const cs = ChangeSet.of([
      { from: 0, to: 3, insert: 'a' },
      { from: 2, to: 5, insert: 'b' },
    ])
    expect(cs.changes).toEqual([{ from: 0, to: 5, insert: 'ab' }])
  })

  it('normalizes inserted line breaks', () => {
    expect(ChangeSet.of([{ from: 0, to: 0, insert: 'a\r\nb\rc' }]).changes[0]!.insert).toBe(
      'a\nb\nc',
    )
  })

  it('inverts', () => {
    const doc = new Doc('hello world')
    const cs = ChangeSet.of([
      { from: 0, to: 5, insert: 'HI' },
      { from: 6, to: 6, insert: 'big ' },
    ])
    const inverse = cs.invert(doc)
    cs.apply(doc)
    expect(doc.toString()).toBe('HI big world')
    inverse.apply(doc)
    expect(doc.toString()).toBe('hello world')
  })

  describe('mapPos', () => {
    const insertAt2 = ChangeSet.of([{ from: 2, to: 2, insert: 'xx' }])
    const replace2to4 = ChangeSet.of([{ from: 2, to: 4, insert: 'abc' }])

    it('before and after a change', () => {
      expect(insertAt2.mapPos(1)).toBe(1)
      expect(insertAt2.mapPos(3)).toBe(5)
      expect(replace2to4.mapPos(6)).toBe(7)
    })

    it('text inserted at the position: after it or before it', () => {
      expect(insertAt2.mapPos(2, -1)).toBe(2)
      expect(insertAt2.mapPos(2, 1)).toBe(4)
    })

    it('inside a replaced range: to its start or end', () => {
      expect(replace2to4.mapPos(3, -1)).toBe(2)
      expect(replace2to4.mapPos(3, 1)).toBe(5)
    })

    it('at a replaced range’s edges', () => {
      expect(replace2to4.mapPos(2)).toBe(2)
      expect(replace2to4.mapPos(4)).toBe(5)
    })
  })
})
