---
'@dskripchenko/code-editor': minor
---

Marks and annotations in the gutter: `setGutterMarks(marks, source)` draws marks beside lines — `added`, `modified`, `deleted` (a diff against the last commit), or a kind of the page's own — and a click on one sends `dsk:gutter-mark`; `setAnnotations(list)` adds a column of short text by the line numbers (who changed a line, and when), a click sending `dsk:annotation`. Both follow the lines as the text is edited.
