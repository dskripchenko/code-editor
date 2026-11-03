import { readText, writeText } from '../../src/text'

describe('readText / writeText', () => {
  const cases: [string, string][] = [
    ['empty', ''],
    ['one line', 'a'],
    ['LF', 'a\nb'],
    ['LF with a final break', 'a\nb\n'],
    ['CRLF', 'a\r\nb'],
    ['CRLF with a final break', 'a\r\nb\r\n'],
    ['an empty last line', 'a\n\n'],
    ['only a break', '\n'],
    ['a lone CR stays in its line', 'a\rb\nc'],
  ]
  for (const [name, text] of cases) {
    it(`gives back ${name} as it was`, () => {
      expect(writeText(readText(text))).toBe(text)
    })
  }

  it('reads lines without their breaks', () => {
    expect(readText('a\r\nb\r\n')).toEqual({
      lines: ['a', 'b'],
      lineBreak: '\r\n',
      finalBreak: true,
    })
  })

  it('an empty text is one empty line', () => {
    expect(readText('')).toEqual({ lines: [''], lineBreak: '\n', finalBreak: false })
  })

  it('a final break is a break, not a line', () => {
    expect(readText('a\n').lines).toEqual(['a'])
    expect(readText('a\n\n').lines).toEqual(['a', ''])
  })

  it('a mixed text is written with the first break met', () => {
    expect(writeText(readText('a\r\nb\nc'))).toBe('a\r\nb\r\nc')
  })
})
