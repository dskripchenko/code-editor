# @dskripchenko/code-editor

[![CI](https://github.com/dskripchenko/code-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/dskripchenko/code-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dskripchenko/code-editor.svg)](https://www.npmjs.com/package/@dskripchenko/code-editor)
[![license](https://img.shields.io/npm/l/@dskripchenko/code-editor.svg)](LICENSE)

A code editor for the browser — **no framework**, **no dependencies** beyond
[`@dskripchenko/syntax`](https://github.com/dskripchenko/syntax) for
highlighting. A class on an element, or a `<dsk-code-editor>` element.

> **Status: 0.1.0.** Typing (IME included), moving and selecting by keys and
> pointer, undo and redo, the clipboard, files of a million lines;
> highlighting as you type, folding, data formats checked while editing; the
> editing commands of a code editor — indentation and `.editorconfig`,
> brackets, comments, lines, several cursors, go to line, search, completion.
> The plan is in [docs/internal/adr-001-code-editor.md](docs/internal/adr-001-code-editor.md).

```ts
import { CodeEditor, defineCodeEditor } from '@dskripchenko/code-editor'

const editor = new CodeEditor(document.getElementById('editor')!, {
  value: 'const answer = 42\n',
  language: 'typescript',
  onChange: (e) => save(e.value),
})
editor.value // 'const answer = 42\n' — line breaks (LF or CRLF) kept as in the file
editor.setSelection(6, 12)
editor.undo()
editor.fold(0) // the block on line 0
editor.setDiagnostics([{ from: 6, to: 12, message: 'unused', severity: 'warning' }])

// Or as an element:
defineCodeEditor()
```

```html
<dsk-code-editor language="php"><script type="text/plain"><?php
echo '<b>shown as text</b>';
</script></dsk-code-editor>
```

## What it is

- **A text model with transactions** — every change maps cursors, folds and
  diagnostics; undo and redo by transaction.
- **Input through EditContext** where the browser has it (Chromium), a hidden
  textarea elsewhere — IME, dead keys and the clipboard as the system does
  them; no `contenteditable`.
- **Only the lines in view drawn** — files of tens of megabytes edit as small
  ones.
- **Highlighting as you type** — incremental, by `@dskripchenko/syntax`;
  folding and checks live while editing.
- **The editing people expect, with VS Code's keys** — indentation and
  `.editorconfig`, brackets and quotes, comments, moving and copying lines,
  several cursors, go to line, search and replace (an API for the page's own
  find bar), completion from the page and from the text.

## Documentation

[English](docs/en/getting-started.md) · [Русский](docs/ru/getting-started.md) ·
[Deutsch](docs/de/getting-started.md) · [中文](docs/zh/getting-started.md)

## License

[MIT](LICENSE)
