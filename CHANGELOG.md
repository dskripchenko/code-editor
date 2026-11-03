# @dskripchenko/code-editor

## 0.0.2

### Patch Changes

- 2dfe32c: Editing, without highlighting yet: a text model changed by transactions (positions follow every change), undo and redo by step, input through EditContext in Chromium and a hidden textarea elsewhere (IME composition on both), moves and selection by keys and pointer (by character over whole graphemes, by word, smart Home, columns kept over tabs, pages, several cursors with Alt+click), the clipboard, shortcuts that work in any keyboard layout, read-only mode and `dsk:change`. Only the lines in view are drawn and a very long line only around the columns in view: a file of a million lines opens in a second or two and takes a key in well under a frame. A text's final line break is now its last, empty line, as in other editors.

## 0.0.1

### Patch Changes

- 50a1e96: The first release: the package's frame — `CodeEditor` on an element and `<dsk-code-editor>`, showing a text's lines with their numbers; the text read and written with its line breaks kept as they were. Editing comes next.
