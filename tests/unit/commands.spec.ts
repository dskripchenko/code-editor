import * as c from '../../src/commands'
import type { Command } from '../../src/commands'
import { Selection, SelectionRange } from '../../src/state/selection'
import { EditorState } from '../../src/state/state'

/** A state from text with `|` for cursors (and `[`…`]` for a selection, `[` the anchor). */
function at(marked: string): EditorState {
  const ranges: SelectionRange[] = []
  let text = ''
  let anchor = -1
  for (const ch of marked) {
    if (ch === '|') ranges.push(SelectionRange.cursor(text.length))
    else if (ch === '[') anchor = text.length
    else if (ch === ']') ranges.push(new SelectionRange(anchor, text.length))
    else text += ch
  }
  const state = EditorState.of(text)
  state.selection = Selection.create(ranges)
  return state
}

/** The state's text with its cursors marked. */
function show(state: EditorState): string {
  let text = state.doc.toString()
  const marks: [number, string][] = []
  for (const r of state.selection.ranges) {
    if (r.empty) marks.push([r.head, '|'])
    else
      marks.push([r.from, r.anchor === r.from ? '[' : ']'], [r.to, r.anchor === r.from ? ']' : '['])
  }
  for (const [pos, mark] of marks.sort((a, b) => b[0] - a[0]))
    text = text.slice(0, pos) + mark + text.slice(pos)
  return text
}

function run(command: Command, marked: string, pageLines = 20): string {
  const state = at(marked)
  const spec = command(state, { pageLines })
  if (spec) state.update(spec)
  return show(state)
}

describe('moving', () => {
  it('by character, over a whole emoji and a letter with its accent', () => {
    expect(run(c.cursorCharRight, '|😀a')).toBe('😀|a')
    expect(run(c.cursorCharLeft, '👍🏽|')).toBe('|👍🏽')
    expect(run(c.cursorCharRight, '|éx')).toBe('é|x')
  })

  it('by character over a line break', () => {
    expect(run(c.cursorCharRight, 'a|\nb')).toBe('a\n|b')
    expect(run(c.cursorCharLeft, 'a\n|b')).toBe('a|\nb')
  })

  it('collapses a selection to its side', () => {
    expect(run(c.cursorCharLeft, 'a[bc]d')).toBe('a|bcd')
    expect(run(c.cursorCharRight, 'a[bc]d')).toBe('abc|d')
  })

  it('by word', () => {
    expect(run(c.cursorWordRight, '|foo.bar baz')).toBe('foo|.bar baz')
    expect(run(c.cursorWordRight, 'foo.bar| baz')).toBe('foo.bar baz|')
    expect(run(c.cursorWordLeft, 'foo.bar  |baz')).toBe('foo.|bar  baz')
    expect(run(c.cursorWordRight, '|привет мир')).toBe('привет| мир')
  })

  it('Home goes to the indent, then to the line start', () => {
    expect(run(c.cursorLineBoundaryBackward, '    code|')).toBe('    |code')
    expect(run(c.cursorLineBoundaryBackward, '    |code')).toBe('|    code')
  })

  it('up and down keep the column, tabs counted by their width', () => {
    expect(run(c.cursorLineDown, 'abcde|f\nab\nabcdefgh')).toBe('abcdef\nab|\nabcdefgh')
    const state = at('abcde|f\nab\nabcdefgh')
    state.update(c.cursorLineDown(state, { pageLines: 1 })!)
    state.update(c.cursorLineDown(state, { pageLines: 1 })!)
    expect(show(state)).toBe('abcdef\nab\nabcde|fgh')
    expect(run(c.cursorLineDown, '    |x\n\ty')).toBe('    x\n\t|y')
  })

  it('up on the first line goes to the start, down on the last to the end', () => {
    expect(run(c.cursorLineUp, 'ab|c\nd')).toBe('|abc\nd')
    expect(run(c.cursorLineDown, 'a\nb|cd')).toBe('a\nbcd|')
  })

  it('a page at a time', () => {
    const text = Array.from({ length: 10 }, (_, i) => `l${i}`).join('\n')
    expect(run(c.cursorPageDown, '|' + text, 3)).toBe(text.replace('l3', '|l3'))
  })

  it('every cursor moves; cursors that meet become one', () => {
    expect(run(c.cursorCharRight, '|a|b')).toBe('a|b|')
    expect(run(c.cursorLineStart, 'a|b|c')).toBe('|abc')
  })

  it('extends a selection', () => {
    expect(run(c.selectCharRight, 'a|bc')).toBe('a[b]c')
    expect(run(c.selectLineEnd, 'a|bc')).toBe('a[bc]')
  })
})

describe('editing', () => {
  it('typing replaces each selection', () => {
    expect(run(c.insertText('X'), 'a|b|c')).toBe('aX|bX|c')
    expect(run(c.insertText('X'), 'a[bc]d')).toBe('aX|d')
  })

  it('a paste of as many lines as cursors goes one line to each', () => {
    expect(run(c.insertText('1\n2', 'input.paste'), '|a\n|b')).toBe('1|a\n2|b')
    expect(run(c.insertText('1\n2\n3', 'input.paste'), '|a\n|b')).toBe('1\n2\n3|a\n1\n2\n3|b')
  })

  it('Enter keeps the indent', () => {
    expect(run(c.insertNewline, '  foo|')).toBe('  foo\n  |')
    expect(run(c.insertNewline, ' | foo')).toBe(' \n | foo')
  })

  it('Tab inserts the indent unit', () => {
    expect(run(c.insertTab, '|x')).toBe('    |x')
  })

  it('Backspace and Delete, by cluster and over line breaks', () => {
    expect(run(c.deleteCharBackward, 'a😀|b')).toBe('a|b')
    expect(run(c.deleteCharBackward, 'a\n|b')).toBe('a|b')
    expect(run(c.deleteCharForward, 'a|\nb')).toBe('a|b')
    expect(run(c.deleteCharBackward, '|ab')).toBe('|ab')
    expect(run(c.deleteCharBackward, 'a[bc]d')).toBe('a|d')
  })

  it('Backspace at two cursors', () => {
    expect(run(c.deleteCharBackward, 'ab|cd|e')).toBe('a|c|e')
  })

  it('by word and to the line start', () => {
    expect(run(c.deleteWordBackward, 'foo bar|')).toBe('foo |')
    expect(run(c.deleteToLineStart, 'a\nfoo bar|')).toBe('a\n|')
  })

  it('the selected text, for copying', () => {
    expect(c.selectedText(at('[ab]c\nd[e]'))).toBe('ab\ne')
    expect(c.selectedText(at('a|b'))).toBe('')
  })
})
