import { History } from '../../src/state/history'
import { Selection } from '../../src/state/selection'
import { EditorState } from '../../src/state/state'
import { random } from './doc.spec'

function type(state: EditorState, history: History, text: string, time: number): void {
  const pos = state.selection.main.head
  history.record(
    state.update({
      changes: { from: pos, to: pos, insert: text },
      selection: Selection.single(pos + text.length),
      userEvent: 'input.type',
    }),
    time,
  )
}

describe('History', () => {
  it('typing in a row is one step; undo brings back the cursor', () => {
    const state = EditorState.of('')
    const history = new History()
    type(state, history, 'a', 0)
    type(state, history, 'b', 100)
    type(state, history, 'c', 200)
    expect(state.doc.toString()).toBe('abc')
    history.undo(state)
    expect(state.doc.toString()).toBe('')
    expect(state.selection.main.head).toBe(0)
    history.redo(state)
    expect(state.doc.toString()).toBe('abc')
    expect(state.selection.main.head).toBe(3)
  })

  it('a pause starts a new step', () => {
    const state = EditorState.of('')
    const history = new History()
    type(state, history, 'a', 0)
    type(state, history, 'b', 2000)
    history.undo(state)
    expect(state.doc.toString()).toBe('a')
  })

  it('moving the cursor starts a new step', () => {
    const state = EditorState.of('')
    const history = new History()
    type(state, history, 'a', 0)
    history.record(state.update({ selection: Selection.single(0), userEvent: 'select' }), 10)
    type(state, history, 'b', 20)
    history.undo(state)
    expect(state.doc.toString()).toBe('a')
  })

  it('a new edit drops what could be redone', () => {
    const state = EditorState.of('')
    const history = new History()
    type(state, history, 'a', 0)
    history.undo(state)
    expect(history.canRedo).toBe(true)
    type(state, history, 'b', 5000)
    expect(history.canRedo).toBe(false)
  })

  it('undoing every random edit gives back the text', () => {
    const next = random(3)
    const original = 'line one\nline two\n\tindented\nend'
    const state = EditorState.of(original)
    const history = new History(0)
    for (let i = 0; i < 300; i++) {
      const len = state.doc.length
      const a = Math.floor(next() * (len + 1))
      const b = Math.min(len, a + Math.floor(next() * 5))
      const c = Math.floor(next() * (len + 1))
      history.record(
        state.update({
          changes: [
            { from: a, to: b, insert: next() < 0.3 ? '\n' : 'ab' },
            ...(c < a || c > b ? [{ from: c, to: c, insert: 'Z' }] : []),
          ],
          userEvent: 'input.paste',
        }),
        i * 1000,
      )
    }
    while (history.canUndo) history.undo(state)
    expect(state.doc.toString()).toBe(original)
  })
})
