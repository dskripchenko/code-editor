import { detectIndent, editorConfigFor, indentOptions } from '../../src/editorconfig'
import { findFrom, matchesIn, replacementFor, searchPattern } from '../../src/search'
import { Doc } from '../../src/state/doc'

describe('search', () => {
  const doc = new Doc('Foo foo\nfood\nfoo')
  it('plain text without case, whole words, regular expressions', () => {
    const all = matchesIn(doc, searchPattern({ search: 'foo' })!, 0, 3)
    expect(all.map((m) => m.from)).toEqual([0, 4, 8, 13])
    expect(
      matchesIn(
        doc,
        searchPattern({ search: 'foo', caseSensitive: true, wholeWord: true })!,
        0,
        3,
      ).map((m) => m.from),
    ).toEqual([4, 13])
    expect(
      matchesIn(doc, searchPattern({ search: 'fo+d', regexp: true })!, 0, 3).map((m) => m.from),
    ).toEqual([8])
    expect(searchPattern({ search: '(', regexp: true })).toBeNull()
    expect(searchPattern({ search: '' })).toBeNull()
    expect(matchesIn(doc, searchPattern({ search: '^', regexp: true })!, 0, 3)).toEqual([])
  })

  it('the next and the previous match, round past the ends', () => {
    const re = searchPattern({ search: 'foo', wholeWord: true })!
    expect(findFrom(doc, re, 1)).toEqual({ from: 4, to: 7 })
    expect(findFrom(doc, re, 14)).toEqual({ from: 0, to: 3 })
    expect(findFrom(doc, re, 4, true)).toEqual({ from: 0, to: 3 })
    expect(findFrom(doc, re, 0, true)).toEqual({ from: 13, to: 16 })
    expect(findFrom(new Doc('x'), re, 0)).toBeNull()
  })

  it('a replacement with the groups of a regular expression', () => {
    const d = new Doc('a=1')
    const q = { search: '(\\w)=(\\d)', regexp: true, replace: '$2=$1' }
    const re = searchPattern(q)!
    expect(replacementFor(d, re, q, { from: 0, to: 3 })).toBe('1=a')
  })
})

describe('.editorconfig', () => {
  const files = {
    '/repo':
      'root = true\n[*]\nindent_style = space\nindent_size = 2\n[*.{go,mk}]\nindent_style = tab\n[Makefile]\nindent_style = tab\n',
    '/repo/src': '[*.py]\nindent_size = 4\n[lib/**.js]\nend_of_line = crlf\n',
    '/elsewhere': '[*]\nindent_size = 8\n',
  }
  it('the nearest file wins; globs with braces, ** and plain names', () => {
    expect(editorConfigFor('/repo/a.ts', files)).toMatchObject({
      indentStyle: 'space',
      indentSize: 2,
    })
    expect(editorConfigFor('/repo/src/x.py', files)).toMatchObject({
      indentStyle: 'space',
      indentSize: 4,
    })
    expect(editorConfigFor('/repo/cmd/main.go', files)).toMatchObject({ indentStyle: 'tab' })
    expect(editorConfigFor('/repo/sub/Makefile', files)).toMatchObject({ indentStyle: 'tab' })
    expect(editorConfigFor('/repo/src/lib/a/b.js', files)).toMatchObject({ endOfLine: 'crlf' })
    expect(indentOptions(editorConfigFor('/repo/a.ts', files))).toEqual({
      indentUnit: '  ',
      tabSize: 2,
    })
    expect(indentOptions(editorConfigFor('/repo/m.go', files)).indentUnit).toBe('\t')
  })

  it('a guess at the indentation', () => {
    expect(detectIndent('a {\n  b {\n    c\n  }\n}')).toBe('  ')
    expect(detectIndent('a\n\tb\n\t\tc')).toBe('\t')
    expect(detectIndent('def f():\n    return 1\n\nclass A:\n    pass')).toBe('    ')
    expect(detectIndent('one line')).toBeNull()
  })
})
