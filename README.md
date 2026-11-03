# @dskripchenko/code-editor

[![CI](https://github.com/dskripchenko/code-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/dskripchenko/code-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dskripchenko/code-editor.svg)](https://www.npmjs.com/package/@dskripchenko/code-editor)
[![license](https://img.shields.io/npm/l/@dskripchenko/code-editor.svg)](LICENSE)

A code editor for the browser — **no framework**, **no dependencies** beyond
[`@dskripchenko/syntax`](https://github.com/dskripchenko/syntax) for
highlighting. A class on an element, or a `<dsk-code-editor>` element.

> **Status: 0.0.x — the frame.** It shows a text's lines with their numbers
> and gives the text back with its line breaks as they were. Editing lands in
> 0.1.0; the plan is in [docs/internal/adr-001-code-editor.md](docs/internal/adr-001-code-editor.md).

```ts
import { CodeEditor, defineCodeEditor } from '@dskripchenko/code-editor'

const editor = new CodeEditor(document.getElementById('editor')!, {
  value: 'const answer = 42\n',
  language: 'typescript',
})
editor.value // 'const answer = 42\n' — line breaks (LF or CRLF) and the final one kept

// Or as an element:
defineCodeEditor()
```

```html
<dsk-code-editor language="php"><script type="text/plain"><?php
echo '<b>shown as text</b>';
</script></dsk-code-editor>
```

## What it is going to be

- **A text model with transactions** — every change maps cursors, marks,
  folds and diagnostics, undo and redo by transaction.
- **Input through EditContext** where the browser has it (Chromium), a hidden
  textarea elsewhere — IME, dead keys and the clipboard as the system does
  them; no `contenteditable`.
- **Only the lines in view drawn** — files of tens of megabytes edit as small
  ones.
- **Highlighting as you type** — incremental, by `@dskripchenko/syntax`;
  folding and checks live while editing.
- **The editing people expect** — indentation and `.editorconfig`, brackets,
  comments, moving and duplicating lines, several cursors, go to line,
  search, completion.
- **Decorations** — gutter marks, underlines and ranges for whatever the page
  adds on top (diff marks, diagnostics, search matches).

## Documentation

[English](docs/en/getting-started.md) · [Русский](docs/ru/getting-started.md) ·
[Deutsch](docs/de/getting-started.md) · [中文](docs/zh/getting-started.md)

## License

[MIT](LICENSE)
