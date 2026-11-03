import { compileKeymap, defaultKeymap, keyName, normalizeKey } from '../../src/keymap'

const key = (
  k: string,
  code: string,
  mods: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {},
) => ({
  key: k,
  code,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
})

describe('keymap', () => {
  it('writes names in one order', () => {
    expect(normalizeKey('Shift-Mod-Z', true)).toBe('Meta-Shift-z')
    expect(normalizeKey('Mod-z', false)).toBe('Ctrl-z')
  })

  it('reads a key event the same way', () => {
    expect(keyName(key('Z', 'KeyZ', { metaKey: true, shiftKey: true }))).toBe('Meta-Shift-z')
    expect(keyName(key('ArrowLeft', 'ArrowLeft', { altKey: true }))).toBe('Alt-ArrowLeft')
  })

  it('a Cyrillic layout: the Latin letter of the key', () => {
    expect(keyName(key('я', 'KeyZ', { metaKey: true }))).toBe('Meta-z')
  })

  it('an Alt-changed letter on macOS: the key’s letter', () => {
    expect(keyName(key('Ω', 'KeyZ', { altKey: true }))).toBe('Alt-z')
  })

  it('bindings per platform', () => {
    const mac = compileKeymap(defaultKeymap, true)
    const other = compileKeymap(defaultKeymap, false)
    expect(mac.has('Meta-z')).toBe(true)
    expect(other.has('Ctrl-z')).toBe(true)
    expect(mac.has('Alt-ArrowLeft')).toBe(true)
    expect(other.has('Ctrl-ArrowLeft')).toBe(true)
    expect(other.has('Meta-ArrowLeft')).toBe(false)
    expect(mac.has('Meta-y')).toBe(false)
  })
})
