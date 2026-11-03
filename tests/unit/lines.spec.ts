import { composeLines, EditorState, type LineChange } from '../../src/state/state'

function random(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
}

/** The lines outside a change are the same before and after it. */
function holds(before: string[], after: string[], c: LineChange): void {
  expect(after.slice(0, c.from)).toEqual(before.slice(0, c.from))
  expect(after.slice(c.newEnd)).toEqual(before.slice(c.oldEnd))
  expect(after.length - before.length).toBe(c.newEnd - c.oldEnd)
}

describe('the lines a transaction changes', () => {
  it('typing in a line, a line break, a paste over lines', () => {
    const state = EditorState.of('a\nb\nc\nd')
    expect(state.update({ changes: { from: 2, to: 2, insert: 'x' } }).lines).toEqual({
      from: 1,
      oldEnd: 2,
      newEnd: 2,
    })
    expect(state.update({ changes: { from: 3, to: 3, insert: '\n' } }).lines).toEqual({
      from: 1,
      oldEnd: 2,
      newEnd: 3,
    })
    expect(state.update({ selection: undefined }).lines).toBeNull()
  })

  it('random changes, one after another and composed: the lines outside are the same', () => {
    const next = random(7)
    for (let run = 0; run < 300; run++) {
      const state = EditorState.of(Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n'))
      const start = state.doc.toString().split('\n')
      let composed: LineChange | null = null
      for (let k = 0; k < 1 + Math.floor(next() * 4); k++) {
        const before = state.doc.toString().split('\n')
        const length = state.doc.length
        const changes = Array.from({ length: 1 + Math.floor(next() * 3) }, () => {
          const from = Math.floor(next() * (length + 1))
          return {
            from,
            to: Math.min(length, from + Math.floor(next() * 12)),
            insert: ['', 'x', '\n', 'a\nb', '\n\n'][Math.floor(next() * 5)]!,
          }
        })
        const tr = state.update({ changes })
        if (tr.lines) holds(before, state.doc.toString().split('\n'), tr.lines)
        else expect(state.doc.toString().split('\n')).toEqual(before)
        composed = composeLines(composed, tr.lines)
      }
      if (composed) holds(start, state.doc.toString().split('\n'), composed)
    }
  })
})
