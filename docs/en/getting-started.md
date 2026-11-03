# Getting started

> 0.0.x is the package's frame: the editor shows a text and gives it back.
> Editing comes in 0.1.0.

## Install

```sh
pnpm add @dskripchenko/code-editor
```

## On an element

```ts
import { CodeEditor } from '@dskripchenko/code-editor'

const editor = new CodeEditor(document.getElementById('editor')!, {
  value: text,
  language: 'typescript', // an id from @dskripchenko/syntax
  lineNumbers: true, // the default
})

editor.value // the text, with the line breaks it was given with
editor.value = other // replaces the text
editor.language = 'php'
editor.lineCount
editor.destroy() // takes it off the page
```

The editor puts its rules into the document (or the shadow root it is in)
once; `CODE_EDITOR_CSS` is the same rules for a page that wants them itself.

## As an element

```ts
import { defineCodeEditor } from '@dskripchenko/code-editor'

defineCodeEditor() // <dsk-code-editor>; defineCodeEditor('my-editor') for another name
```

```html
<dsk-code-editor language="yaml"><script type="text/plain">key: value
</script></dsk-code-editor>
```

The text is read from a `<script type="text/plain">` inside the element, so
nothing in it is taken as markup; the `value` property reads and replaces it.
The element keeps its text when it is moved in the page.

## Line breaks

`readText` and `writeText` are what the editor uses: lines without their
breaks, the break the text uses (`\n` or `\r\n`, the first one met) and
whether it ends with one. A text comes back exactly as it was read.

## Theme

Colours and the font are custom properties on `.dsk-code-editor`
(`--dsk-code-editor-bg`, `--dsk-code-editor-fg`, `--dsk-code-editor-gutter-fg`,
`--dsk-code-editor-font`, `--dsk-code-editor-font-size`,
`--dsk-code-editor-line-height`). Dark follows `data-theme="dark"` on an
ancestor or the system.

## Browsers

Chromium takes input through the EditContext API, WebKit and Firefox through
a hidden textarea; `supportsEditContext()` tells which one a browser gets.
