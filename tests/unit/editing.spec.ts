import * as c from '../../src/commands'
import type { Command } from '../../src/commands'
import { languageEditing } from '../../src/language'
import { Selection, SelectionRange } from '../../src/state/selection'
import { EditorState } from '../../src/state/state'

/** A state from text with `|` for cursors and `«`…`»` for a selection (`«` the anchor; `»…«` backwards). */
function at(marked: string, indentUnit = '  '): EditorState {
  const ranges: SelectionRange[] = []
  let text = ''
  let open = -1
  let back = -1
  for (const ch of marked) {
    if (ch === '|') ranges.push(SelectionRange.cursor(text.length))
    else if (ch === '«') {
      if (back >= 0) {
        ranges.push(new SelectionRange(text.length, back))
        back = -1
      } else open = text.length
    } else if (ch === '»') {
      if (open >= 0) {
        ranges.push(new SelectionRange(open, text.length))
        open = -1
      } else back = text.length
    } else text += ch
  }
  const state = EditorState.of(text, { indentUnit, tabSize: 4 })
  state.selection = Selection.create(ranges)
  return state
}

function show(state: EditorState): string {
  let text = state.doc.toString()
  const marks: [number, string][] = []
  for (const r of state.selection.ranges) {
    if (r.empty) marks.push([r.head, '|'])
    else
      marks.push([r.from, r.anchor === r.from ? '«' : '»'], [r.to, r.anchor === r.from ? '»' : '«'])
  }
  for (const [pos, mark] of marks.sort((a, b) => b[0] - a[0]))
    text = text.slice(0, pos) + mark + text.slice(pos)
  return text
}

function run(command: Command, marked: string, language = 'javascript', indentUnit = '  '): string {
  const state = at(marked, indentUnit)
  const spec = command(state, { pageLines: 20, language: languageEditing(language) })
  if (spec) state.update(spec)
  return show(state)
}

describe('indentation', () => {
  it('Enter: the indent kept, a step deeper after an opening bracket, a pair split over three lines', () => {
    expect(run(c.insertNewline, '  a|')).toBe('  a\n  |')
    expect(run(c.insertNewline, 'if (x) {|')).toBe('if (x) {\n  |')
    expect(run(c.insertNewline, '  f(|)')).toBe('  f(\n    |\n  )')
    expect(run(c.insertNewline, '{|  }')).toBe('{\n  |\n}')
    expect(run(c.insertNewline, 'def f():|', 'python', '    ')).toBe('def f():\n    |')
    expect(run(c.insertNewline, 'a: |b', 'yaml')).toBe('a: \n  |b')
  })

  it('Tab: spaces to the next stop; over lines, the lines a step deeper; Shift-Tab back', () => {
    expect(run(c.insertTab, 'a|')).toBe('a |')
    // Whole lines selected stay whole: the indent inside the selection.
    expect(run(c.insertTab, '«a\nb»')).toBe('«  a\n  b»')
    expect(run(c.indentMore, 'x|')).toBe('  x|')
    expect(run(c.indentLess, '     «a\n  b»')).toBe('    «a\nb»')
    expect(run(c.indentLess, '\t|a', 'javascript', '\t')).toBe('|a')
    // A selection ending at a line's start leaves that line be.
    expect(run(c.indentMore, '«a\n»b')).toBe('«  a\n»b')
  })

  it('Backspace: in the indentation to the previous stop; between a pair, both', () => {
    expect(run(c.deleteBackward, '     |a')).toBe('    |a')
    expect(run(c.deleteBackward, '    |a')).toBe('  |a')
    expect(run(c.deleteBackward, 'x  |a')).toBe('x |a')
    expect(run(c.deleteBackward, 'f(|)')).toBe('f|')
    expect(run(c.deleteBackward, '"|"')).toBe('|')
    expect(run(c.deleteBackward, 'a|\nb|')).toBe('|\n|')
  })
})

describe('typing pairs', () => {
  it('an opening bracket closes itself before space, the end or a closing one; not before a word', () => {
    expect(run(c.typeText('('), 'f|')).toBe('f(|)')
    expect(run(c.typeText('['), 'x = |;')).toBe('x = [|];')
    expect(run(c.typeText('('), '|word')).toBe('(|word')
  })

  it('a closing one steps over the same character; a quote after a letter is an apostrophe', () => {
    expect(run(c.typeText(')'), 'f(|)')).toBe('f()|')
    expect(run(c.typeText('"'), '"a|"')).toBe('"a"|')
    expect(run(c.typeText("'"), 'don|')).toBe("don'|")
    expect(run(c.typeText("'"), '|', 'javascript')).toBe("'|'")
    expect(run(c.typeText('`'), '|', 'python')).toBe('`|')
  })

  it('around a selection: wrapped, still selected; with several cursors, at each', () => {
    expect(run(c.typeText('('), 'a «b» c')).toBe('a («b») c')
    expect(run(c.typeText('"'), '«x»')).toBe('"«x»"')
    expect(run(c.typeText('('), 'f|\ng|')).toBe('f(|)\ng(|)')
  })
})

describe('comments', () => {
  it('lines commented at their least indentation, and back', () => {
    expect(run(c.toggleLineComment, '  «a\n    b»')).toBe('  «// a\n  //   b»')
    expect(run(c.toggleLineComment, '  // a|\n')).toBe('  a|\n')
    expect(run(c.toggleLineComment, '«a\n\nb»')).toBe('«// a\n\n// b»')
    expect(run(c.toggleLineComment, 'x = 1|', 'python')).toBe('# x = 1|')
    expect(run(c.toggleLineComment, 'select 1|', 'sql')).toBe('-- select 1|')
  })

  it('a block comment where there is no line comment, and around a selection', () => {
    expect(run(c.toggleLineComment, '  <b>|</b>', 'html')).toBe('  <!-- <b>|</b> -->')
    expect(run(c.toggleLineComment, '  <!-- <b>|</b> -->', 'html')).toBe('  <b>|</b>')
    // The marks inside the selection: the same keys take them away again.
    expect(run(c.toggleBlockComment, 'a «b» c')).toBe('a «/* b */» c')
    expect(run(c.toggleBlockComment, 'a «/* b */» c')).toBe('a «b» c')
  })
})

describe('lines', () => {
  it('moved up and down with the selection, several lines at once', () => {
    expect(run(c.moveLineUp, 'a\nb|\nc')).toBe('b|\na\nc')
    expect(run(c.moveLineDown, 'a|\nb\nc')).toBe('b\na|\nc')
    expect(run(c.moveLineDown, '«a\nb»\nc')).toBe('c\n«a\nb»')
    expect(run(c.moveLineUp, 'a|\nb')).toBe('a|\nb')
  })

  it('copied up and down, deleted, a new line below and above', () => {
    expect(run(c.copyLineDown, 'a|b\nc')).toBe('ab\na|b\nc')
    expect(run(c.copyLineUp, 'a|b\nc')).toBe('a|b\nab\nc')
    expect(run(c.deleteLine, 'a\nb|\nc')).toBe('a\n|c')
    expect(run(c.deleteLine, 'a\nb|')).toBe('a|')
    expect(run(c.insertLineAfter, '  a|b\nc')).toBe('  ab\n  |\nc')
    expect(run(c.insertLineBefore, '  a|b')).toBe('  |\n  ab')
  })

  it('the line selected, then the next one with it', () => {
    expect(run(c.selectLine, 'a|b\ncd\ne')).toBe('«ab\n»cd\ne')
    expect(run(c.selectLine, '«ab\n»cd\ne')).toBe('«ab\ncd\n»e')
  })

  it('whole lines for a copy without a selection', () => {
    expect(c.linesText(at('a|\nb\nc|'))).toBe('a\nc\n')
  })
})

describe('several cursors', () => {
  it('a cursor more above and below, at the same column', () => {
    expect(run(c.addCursorBelow, 'ab|c\nd\nefg')).toBe('ab|c\nd|\nefg')
    expect(run(c.addCursorAbove, 'abc\nde|f')).toBe('ab|c\nde|f')
  })

  it('the word, then its next occurrences (whole selections), all of them at once', () => {
    expect(run(c.selectNextOccurrence, 'fo|o bar foo')).toBe('«foo» bar foo')
    expect(run(c.selectNextOccurrence, '«foo» bar foo')).toBe('«foo» bar «foo»')
    expect(run(c.selectAllOccurrences, 'x |a xa a')).toBe('x «a» xa «a»')
  })
})
