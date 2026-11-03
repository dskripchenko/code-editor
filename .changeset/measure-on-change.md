---
'@dskripchenko/code-editor': patch
---

The editor measures its lines again whenever their height or font changes (a hidden ruler watched by a `ResizeObserver`): made outside the page, or with `--dsk-code-editor-line-height` changed later, a click or a hover far down a file no longer lands lines below the pointer. A completion or menu item picked with a click keeps the cursor where the item went, and a tooltip stays open over transactions that move neither the text nor the cursor.
