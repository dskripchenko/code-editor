---
'@dskripchenko/code-editor': patch
---

`editor.lineBreak` tells the line break in use (`\n` or `\r\n`); the editor sends `dsk:selection` (its `detail.selection`) whenever the cursors move or the text under them changes, for a status line.
