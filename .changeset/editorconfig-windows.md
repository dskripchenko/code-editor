---
'@dskripchenko/code-editor': patch
---

`editorConfigFor` reads the files of directories given in Windows form (backslashes): their text was looked up by the path after it had been rewritten with forward slashes, and found empty.
