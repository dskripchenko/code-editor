import { EditorState } from '../../src/state/state'
import { expandSnippet } from '../../src/view/popups'

describe('snippets and position edits', () => {
  it('a snippet: places as text, the first selected; $0 or the end otherwise; escapes kept', () => {
    expect(expandSnippet('log(${1:message}, $2)$0')).toEqual({
      text: 'log(message, )',
      select: [4, 11],
    })
    expect(expandSnippet('done$0!')).toEqual({ text: 'done!', select: [4, 4] })
    expect(expandSnippet('plain')).toEqual({ text: 'plain', select: [5, 5] })
    expect(expandSnippet('cost \\$5')).toEqual({ text: 'cost $5', select: [7, 7] })
  })

  it('a transaction’s edits: line and character ranges of the text before, the last first', () => {
    const state = EditorState.of('ab\ncd\nef')
    const tr = state.update({
      changes: [
        { from: 1, to: 1, insert: 'X' },
        { from: 3, to: 6, insert: 'Y\nZ' },
      ],
    })
    expect(tr.edits).toEqual([
      { from: { line: 1, character: 0 }, to: { line: 2, character: 0 }, text: 'Y\nZ' },
      { from: { line: 0, character: 1 }, to: { line: 0, character: 1 }, text: 'X' },
    ])
    // Applied in that order to the text before, they give the text after.
    let lines = 'ab\ncd\nef'.split('\n')
    for (const e of tr.edits) {
      const text = lines.join('\n')
      const off = (p: { line: number; character: number }) =>
        lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character
      lines = (text.slice(0, off(e.from)) + e.text + text.slice(off(e.to))).split('\n')
    }
    expect(lines.join('\n')).toBe(state.doc.toString())
  })
})
